const SUPABASE_URL='https://zvtzbiqfwhggysiuiuxh.supabase.co'
const SUPABASE_KEY='sb_publishable_6rUNIHwItIcgG_HLyTfOxA_bKACJEQt'
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
let OPERACOES=[]
let TAXAS=[]
let ATIVOS=[]
let CALC=null
let CHART1=null
let CHART2=null
let VALORES_VISIVEIS=false
const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const num=v=>(Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:2})
const dataBR=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'—'
const mesBR=s=>new Date(s+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})
function hoje(){
return new Date().toISOString().slice(0,10)
}
function avisar(t){
let el=document.getElementById('status')
if(el)el.textContent=t
}
/*=========================================================
001 NAVEGAÇÃO
=========================================================*/
document.querySelectorAll('.nav button').forEach(b=>{
b.onclick=()=>{
document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('ativo'))
document.querySelectorAll('.aba').forEach(x=>x.classList.remove('ativa'))
b.classList.add('ativo')
let aba=document.getElementById(b.dataset.tab)
if(aba)aba.classList.add('ativa')
}
})
/*=========================================================
002 CARREGAR DADOS
=========================================================*/
async function carregar(){
avisar('Atualizando…')
try{
let [o,t,a]=await Promise.all([
db.from('nemesio_operacoes').select('*').order('data',{ascending:true}).order('id',{ascending:true}),
db.from('nemesio_taxas').select('*').order('data',{ascending:true}),
db.from('nemesio_ativos').select('*').order('empresa',{ascending:true})
])
if(o.error){
console.error('Erro operações:',o.error)
avisar('Erro ao carregar operações')
return
}
OPERACOES=o.data||[]
if(t.error){
console.warn('Erro taxas:',t.error)
TAXAS=[]
}else{
TAXAS=t.data||[]
}
if(a.error){
console.warn('Tabela nemesio_ativos indisponível. Usando operações.',a.error)
ATIVOS=[]
}else{
ATIVOS=(a.data||[]).filter(x=>x.ativo===undefined||x.ativo===null||x.ativo===true)
}
let mapa=new Map()
ATIVOS.forEach(a=>{
let empresa=String(a.empresa||'').trim()
let codigo=String(a.codigo||'').trim().toUpperCase()
if(!empresa||!codigo)return
mapa.set(codigo,{...a,empresa,codigo})
})
OPERACOES.forEach(o=>{
let empresa=String(o.empresa||'').trim()
let codigo=String(o.codigo||'').trim().toUpperCase()
if(!empresa||!codigo)return
if(!mapa.has(codigo)){
mapa.set(codigo,{id:null,empresa,codigo,ativo:true})
}
})
ATIVOS=[...mapa.values()].sort((a,b)=>a.empresa.localeCompare(b.empresa,'pt-BR'))
CALC=calcular()
renderTudo()
avisar('Dados atualizados • '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))
}catch(erro){
console.error('Erro geral ao carregar painel:',erro)
avisar('Erro ao carregar painel')
}
}
/*=========================================================
003 CALCULAR CARTEIRA E RESULTADOS
=========================================================*/
function calcular(){
let ops=[...OPERACOES].sort((a,b)=>String(a.data||'').localeCompare(String(b.data||''))||Number(a.id||0)-Number(b.id||0))
let ativos={}
let realizado=0
let compras=0
let vendas=0
for(const o of ops){
let codigo=String(o.codigo||'').trim().toUpperCase()
if(!codigo)continue
let a=ativos[codigo]||(ativos[codigo]={
empresa:o.empresa,
codigo,
qtd:0,
custo:0,
realizado:0,
operacoes:0
})
let q=Number(o.quantidade)||0
let p=Number(o.preco_unitario)||0
let v=q*p
a.empresa=o.empresa
a.operacoes++
if(o.tipo==='Compra'){
a.custo+=v
a.qtd+=q
compras+=v
}else if(o.tipo==='Venda'){
let pm=a.qtd>0?a.custo/a.qtd:0
let qtdBaixa=Math.min(q,a.qtd)
let cv=qtdBaixa*pm
let l=v-cv
a.qtd-=qtdBaixa
a.custo-=cv
if(Math.abs(a.qtd)<0.000001){
a.qtd=0
a.custo=0
}
a.realizado+=l
realizado+=l
vendas+=v
}
}
let carteira=Object.values(ativos).map(a=>({
...a,
pm:a.qtd?a.custo/a.qtd:0
})).sort((a,b)=>b.custo-a.custo)
let mensal={}
for(const o of ops){
if(!o.data)continue
let m=String(o.data).slice(0,7)
let x=mensal[m]||(mensal[m]={
mes:m,
compras:0,
vendas:0,
lucro:0,
taxas:0
})
let valor=Number(o.valor_bruto)||((Number(o.quantidade)||0)*(Number(o.preco_unitario)||0))
if(o.tipo==='Compra')x.compras+=valor
if(o.tipo==='Venda')x.vendas+=valor
}
let state={}
for(const o of ops){
let codigo=String(o.codigo||'').trim().toUpperCase()
if(!codigo||!o.data)continue
let a=state[codigo]||(state[codigo]={q:0,c:0})
let q=Number(o.quantidade)||0
let v=q*(Number(o.preco_unitario)||0)
let m=String(o.data).slice(0,7)
if(!mensal[m]){
mensal[m]={mes:m,compras:0,vendas:0,lucro:0,taxas:0}
}
if(o.tipo==='Compra'){
a.q+=q
a.c+=v
}else if(o.tipo==='Venda'){
let pm=a.q>0?a.c/a.q:0
let qtdBaixa=Math.min(q,a.q)
let cv=qtdBaixa*pm
mensal[m].lucro+=v-cv
a.q-=qtdBaixa
a.c-=cv
if(a.q<=0){
a.q=0
a.c=0
}
}
}
let taxasTotal=0
for(const t of TAXAS){
if(!t.data)continue
let m=String(t.data).slice(0,7)
if(!mensal[m]){
mensal[m]={mes:m,compras:0,vendas:0,lucro:0,taxas:0}
}
let liquidacao=Number(t.taxa_liquidacao)||0
let negociacao=Number(t.taxa_negociacao)||0
let taxa=liquidacao+negociacao
mensal[m].taxas+=taxa
taxasTotal+=taxa
}
return{
carteira,
realizado,
compras,
vendas,
taxasTotal,
mensal:Object.values(mensal).sort((a,b)=>a.mes.localeCompare(b.mes)),
investido:carteira.reduce((s,a)=>s+a.custo,0),
qtd:carteira.reduce((s,a)=>s+a.qtd,0)
}
}
/*=========================================================
004 CARREGAR LISTAS DE ATIVOS
=========================================================*/
function carregarListasAtivos(){
let selectEmpresa=document.getElementById('opEmpresa')
let selectCodigo=document.getElementById('opCodigo')
if(!selectEmpresa||!selectCodigo)return
let empresaAtual=selectEmpresa.value||''
let codigoAtual=selectCodigo.value||''
let empresas=[...ATIVOS].sort((a,b)=>String(a.empresa||'').localeCompare(String(b.empresa||''),'pt-BR'))
let codigos=[...ATIVOS].sort((a,b)=>String(a.codigo||'').localeCompare(String(b.codigo||''),'pt-BR'))
let nomesEmpresas=[]
let vistos=new Set()
empresas.forEach(a=>{
let nome=String(a.empresa||'').trim()
if(nome&&!vistos.has(nome)){
vistos.add(nome)
nomesEmpresas.push(nome)
}
})
selectEmpresa.innerHTML=`
<option value="">Selecione a empresa</option>
${nomesEmpresas.map(empresa=>`<option value="${escaparHTML(empresa)}">${escaparHTML(empresa)}</option>`).join('')}
<option value="__NOVO__">➕ CADASTRAR NOVO ATIVO</option>
`
selectCodigo.innerHTML=`
<option value="">Selecione o código</option>
${codigos.map(a=>`<option value="${escaparHTML(a.codigo)}">${escaparHTML(a.codigo)} — ${escaparHTML(a.empresa)}</option>`).join('')}
<option value="__NOVO__">➕ CADASTRAR NOVO ATIVO</option>
`
if(empresaAtual&&empresaAtual!=='__NOVO__'&&nomesEmpresas.includes(empresaAtual)){
selectEmpresa.value=empresaAtual
}
if(codigoAtual&&codigoAtual!=='__NOVO__'&&ATIVOS.some(a=>a.codigo===codigoAtual)){
selectCodigo.value=codigoAtual
}
}
/*=========================================================
005 ESCAPAR HTML
=========================================================*/
function escaparHTML(valor){
return String(valor??'')
.replaceAll('&','&amp;')
.replaceAll('<','&lt;')
.replaceAll('>','&gt;')
.replaceAll('"','&quot;')
.replaceAll("'","&#039;")
}
/*=========================================================
006 SELECIONAR EMPRESA
=========================================================*/
function selecionarEmpresa(){
let selectEmpresa=document.getElementById('opEmpresa')
let selectCodigo=document.getElementById('opCodigo')
if(!selectEmpresa||!selectCodigo)return
let empresa=selectEmpresa.value
if(empresa==='__NOVO__'){
abrirNovoAtivo()
return
}
if(!empresa){
selectCodigo.value=''
return
}
let correspondentes=ATIVOS.filter(a=>a.empresa===empresa)
if(correspondentes.length===1){
selectCodigo.value=correspondentes[0].codigo
return
}
if(correspondentes.length>1){
selectCodigo.value=''
avisar('Selecione o código • '+correspondentes.map(a=>a.codigo).join(', '))
}
}
/*=========================================================
007 SELECIONAR CÓDIGO
=========================================================*/
function selecionarCodigo(){
let selectEmpresa=document.getElementById('opEmpresa')
let selectCodigo=document.getElementById('opCodigo')
if(!selectEmpresa||!selectCodigo)return
let codigo=selectCodigo.value
if(codigo==='__NOVO__'){
abrirNovoAtivo()
return
}
if(!codigo){
selectEmpresa.value=''
return
}
let ativo=ATIVOS.find(a=>a.codigo===codigo)
if(ativo){
selectEmpresa.value=ativo.empresa
}
}
/*=========================================================
008 CADASTRAR NOVO ATIVO
=========================================================*/
async function abrirNovoAtivo(){
let selectEmpresa=document.getElementById('opEmpresa')
let selectCodigo=document.getElementById('opCodigo')
if(selectEmpresa)selectEmpresa.value=''
if(selectCodigo)selectCodigo.value=''
let empresa=prompt('Informe o nome da nova empresa:')
if(empresa===null)return
empresa=String(empresa).trim()
if(!empresa){
alert('Informe o nome da empresa.')
return
}
let codigo=prompt('Informe o código da ação/ativo.\nExemplo: PETR4')
if(codigo===null)return
codigo=String(codigo).trim().toUpperCase()
if(!codigo){
alert('Informe o código do ativo.')
return
}
let existente=ATIVOS.find(a=>String(a.codigo||'').toUpperCase()===codigo)
if(existente){
alert('Este código já está cadastrado:\n\n'+existente.empresa+' — '+existente.codigo)
carregarListasAtivos()
if(selectEmpresa)selectEmpresa.value=existente.empresa
if(selectCodigo)selectCodigo.value=existente.codigo
return
}
avisar('Cadastrando novo ativo…')
let r=await db.from('nemesio_ativos').insert({
empresa,
codigo,
ativo:true
}).select().single()
if(r.error){
console.error('Erro ao cadastrar ativo:',r.error)
alert('Não foi possível cadastrar o ativo.\n\n'+r.error.message)
avisar('Erro ao cadastrar ativo')
return
}
ATIVOS.push(r.data)
carregarListasAtivos()
if(selectEmpresa)selectEmpresa.value=r.data.empresa
if(selectCodigo)selectCodigo.value=r.data.codigo
avisar('Novo ativo cadastrado')
}
/*=========================================================
009 PRIVACIDADE DOS VALORES
=========================================================*/
function alternarValores(){
VALORES_VISIVEIS=!VALORES_VISIVEIS
atualizarVisibilidadeValores()
}
/*=========================================================
010 ATUALIZAR VISIBILIDADE
=========================================================*/
function atualizarVisibilidadeValores(){
document.querySelectorAll('.valor-sensivel').forEach(el=>{
if(VALORES_VISIVEIS){
el.textContent=el.dataset.valor||'R$ 0,00'
el.classList.remove('valores-ocultos')
}else{
el.textContent='••••••'
el.classList.add('valores-ocultos')
}
})
let lucro=document.getElementById('kLucro')
if(lucro){
lucro.classList.remove('pos','neg')
if(VALORES_VISIVEIS&&CALC){
lucro.classList.add(CALC.realizado>=0?'pos':'neg')
}
}
document.querySelectorAll('.icone-visibilidade').forEach(el=>{
el.textContent=VALORES_VISIVEIS?'🙈':'👁'
})
document.querySelectorAll('.btn-olho').forEach(btn=>{
btn.title=VALORES_VISIVEIS?'Ocultar valores':'Mostrar valores'
btn.setAttribute('aria-label',VALORES_VISIVEIS?'Ocultar valores':'Mostrar valores')
})
}
/*=========================================================
011 RENDERIZAR TUDO
=========================================================*/
function renderTudo(){
if(!CALC)return
carregarListasAtivos()
let kInvestido=document.getElementById('kInvestido')
let kQtd=document.getElementById('kQtd')
let kLucro=document.getElementById('kLucro')
let kTaxas=document.getElementById('kTaxas')
let kCompras=document.getElementById('kCompras')
let kVendas=document.getElementById('kVendas')
if(kInvestido)kInvestido.dataset.valor=brl(CALC.investido)
if(kQtd)kQtd.textContent=num(CALC.qtd)
if(kLucro)kLucro.dataset.valor=brl(CALC.realizado)
if(kTaxas)kTaxas.textContent=brl(CALC.taxasTotal)
if(kCompras)kCompras.dataset.valor=brl(CALC.compras)
if(kVendas)kVendas.dataset.valor=brl(CALC.vendas)
atualizarVisibilidadeValores()
renderCarteira()
renderOperacoes()
renderMensal()
renderTaxas()
renderGraficos()
}
/*=========================================================
012 CRIAR TABELA
=========================================================*/
function tabela(headers,rows){
return `
<div class="tablewrap">
<table>
<thead>
<tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr>
</thead>
<tbody>
${rows.length?rows.join(''):`<tr><td colspan="${headers.length}" style="text-align:center;color:#64748b;padding:25px">Nenhum registro encontrado.</td></tr>`}
</tbody>
</table>
</div>
`
}
/*=========================================================
013 RENDERIZAR CARTEIRA
=========================================================*/
function renderCarteira(){
let rows=CALC.carteira.map(a=>`
<tr>
<td><b>${escaparHTML(a.empresa)}</b></td>
<td><b>${escaparHTML(a.codigo)}</b></td>
<td class="right">${num(a.qtd)}</td>
<td class="right">${brl(a.custo)}</td>
<td class="right">${brl(a.pm)}</td>
<td class="right ${a.realizado>=0?'pos':'neg'}">${brl(a.realizado)}</td>
<td class="right">${a.operacoes}</td>
</tr>
`)
let html=tabela([
'Empresa',
'Código',
'Qtd. atual',
'Custo atual',
'Preço médio',
'Lucro/Prejuízo realizado',
'Operações'
],rows)
let carteira=document.getElementById('tabelaCarteira')
let resumo=document.getElementById('resumoPainel')
if(carteira)carteira.innerHTML=html
if(resumo)resumo.innerHTML=html
}
/*=========================================================
014 RENDERIZAR OPERAÇÕES
=========================================================*/
function renderOperacoes(){
let busca=document.getElementById('buscaOp')
let tipo=document.getElementById('tipoOp')
let q=String(busca?.value||'').toLowerCase().trim()
let tp=tipo?.value||''
let dados=[...OPERACOES].filter(o=>{
let texto=(String(o.empresa||'')+' '+String(o.codigo||'')).toLowerCase()
return(!q||texto.includes(q))&&(!tp||o.tipo===tp)
}).sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))||Number(b.id||0)-Number(a.id||0))
let rows=dados.map(o=>{
let valor=Number(o.valor_bruto)||((Number(o.quantidade)||0)*(Number(o.preco_unitario)||0))
return `<tr>
<td>${dataBR(o.data)}</td>
<td>${escaparHTML(o.empresa)}</td>
<td><b>${escaparHTML(o.codigo)}</b></td>
<td><span class="tag ${String(o.tipo||'').toLowerCase()}">${escaparHTML(o.tipo)}</span></td>
<td class="right">${num(o.quantidade)}</td>
<td class="right">${brl(o.preco_unitario)}</td>
<td class="right"><b>${brl(valor)}</b></td>
<td><button class="btn-excluir-mini" type="button" onclick="excluirOperacao(${Number(o.id)})" title="Excluir operação">Excluir</button></td>
</tr>`
})
let box=document.getElementById('tabelaOperacoes')
if(box){
box.innerHTML=tabela(['Data','Empresa','Código','Tipo','Qtd.','Preço','Valor bruto',''],rows)
}
}
/*=========================================================
015 RENDERIZAR RESULTADO MENSAL
=========================================================*/
function renderMensal(){
let rows=[...CALC.mensal].reverse().map(x=>`
<tr>
<td><b>${mesBR(x.mes+'-01')}</b></td>
<td class="right">${brl(x.compras)}</td>
<td class="right">${brl(x.vendas)}</td>
<td class="right ${x.lucro>=0?'pos':'neg'}">${brl(x.lucro)}</td>
<td class="right">${brl(x.taxas)}</td>
<td class="right ${(x.lucro-x.taxas)>=0?'pos':'neg'}">${brl(x.lucro-x.taxas)}</td>
</tr>
`)
let box=document.getElementById('tabelaMensal')
if(box){
box.innerHTML=tabela([
'Mês',
'Compras',
'Vendas',
'Resultado bruto',
'Taxas',
'Resultado após taxas'
],rows)
}
}
/*=========================================================
016 RENDERIZAR TAXAS
=========================================================*/
function renderTaxas(){
let dados=[...TAXAS].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')))
let rows=dados.map(t=>{
let liquidacao=Number(t.taxa_liquidacao)||0
let negociacao=Number(t.taxa_negociacao)||0
let irrf=Number(t.irrf)||0
let total=liquidacao+negociacao
return `<tr>
<td><b>${dataBR(t.data)}</b></td>
<td class="right">${brl(liquidacao)}</td>
<td class="right">${brl(negociacao)}</td>
<td class="right"><b>${brl(total)}</b></td>
<td class="right">${brl(irrf)}</td>
<td><button class="btn-excluir-mini" type="button" onclick="excluirTaxa(${Number(t.id)})" title="Excluir registro">Excluir</button></td>
</tr>`
})
let box=document.getElementById('tabelaTaxas')
if(box){
box.innerHTML=tabela(['Data','Liquidação','Negociação','Total','IRRF',''],rows)
}
}
/*=========================================================
017 RENDERIZAR GRÁFICOS
=========================================================*/
function renderGraficos(){
if(typeof Chart==='undefined'||!CALC)return
let grafResultado=document.getElementById('grafResultado')
let grafCarteira=document.getElementById('grafCarteira')
/*=========================================================
GRÁFICO RESULTADO MENSAL
=========================================================*/
let labels=CALC.mensal.map(x=>mesBR(x.mes+'-01'))
let lucros=CALC.mensal.map(x=>x.lucro-x.taxas)
if(CHART1){
CHART1.destroy()
CHART1=null
}
if(grafResultado){
CHART1=new Chart(grafResultado,{
type:'bar',
data:{
labels:labels,
datasets:[{
label:'Resultado após taxas',
data:lucros
}]
},
options:{
responsive:true,
maintainAspectRatio:false,
plugins:{
legend:{
display:false
},
tooltip:{
backgroundColor:'#0f172a',
titleColor:'#ffffff',
bodyColor:'#ffffff',
padding:12,
cornerRadius:8,
callbacks:{
label:ctx=>brl(ctx.raw)
}
},
datalabels:{
display:false
}
},
scales:{
x:{
grid:{
display:false
},
ticks:{
color:'#64748b',
font:{
size:11,
weight:'600'
}
}
},
y:{
beginAtZero:true,
grid:{
color:'rgba(148,163,184,.15)'
},
ticks:{
color:'#64748b',
callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')
}
}
}
}
})
}
/*=========================================================
GRÁFICO ROSCA - CAPITAL INVESTIDO
=========================================================*/
let ativos=CALC.carteira.filter(x=>Number(x.custo)>0).sort((a,b)=>Number(b.custo)-Number(a.custo))
if(CHART2){
CHART2.destroy()
CHART2=null
}
if(!grafCarteira)return
if(!ativos.length){
let contexto=grafCarteira.getContext('2d')
contexto.clearRect(0,0,grafCarteira.width,grafCarteira.height)
return
}
/*=========================================================
TOTAL INVESTIDO
=========================================================*/
let totalInvestido=ativos.reduce((total,ativo)=>total+(Number(ativo.custo)||0),0)
/*=========================================================
LABELS E VALORES
=========================================================*/
let labelsAtivos=ativos.map(ativo=>ativo.codigo)
let valoresAtivos=ativos.map(ativo=>Number(ativo.custo)||0)
/*=========================================================
CORES
=========================================================*/
let coresAtivos=[
'#2563eb',
'#0f766e',
'#7c3aed',
'#ea580c',
'#0891b2',
'#65a30d',
'#db2777',
'#ca8a04',
'#475569',
'#9333ea',
'#0284c7',
'#16a34a',
'#e11d48',
'#4f46e5',
'#059669',
'#d97706'
]
/*=========================================================
CRIAR GRÁFICO DE ROSCA
=========================================================*/
CHART2=new Chart(grafCarteira,{
type:'doughnut',
data:{
labels:labelsAtivos,
datasets:[{
data:valoresAtivos,
backgroundColor:ativos.map((ativo,i)=>coresAtivos[i%coresAtivos.length]),
borderColor:'#ffffff',
borderWidth:3,
hoverBorderWidth:3,
hoverOffset:7
}]
},
plugins:[
typeof ChartDataLabels!=='undefined'?ChartDataLabels:{}
],
options:{
responsive:true,
maintainAspectRatio:false,
cutout:'62%',
layout:{
padding:{
top:15,
right:10,
bottom:15,
left:10
}
},
plugins:{
/*=========================================================
LEGENDA
=========================================================*/
legend:{
display:true,
position:'right',
align:'center',
labels:{
usePointStyle:true,
pointStyle:'circle',
boxWidth:9,
boxHeight:9,
padding:14,
color:'#334155',
font:{
size:12,
weight:'600'
},
generateLabels:function(chart){
let dataset=chart.data.datasets[0]
return chart.data.labels.map((label,i)=>{
let valor=Number(dataset.data[i])||0
let percentual=totalInvestido>0?(valor/totalInvestido)*100:0
let meta=chart.getDatasetMeta(0)
let estilo=meta.controller.getStyle(i)
return{
text:label+'   '+percentual.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%',
fillStyle:estilo.backgroundColor,
strokeStyle:estilo.backgroundColor,
lineWidth:0,
fontColor:'#334155',
hidden:!chart.getDataVisibility(i),
index:i
}
})
}
}
},
/*=========================================================
TOOLTIP
=========================================================*/
tooltip:{
backgroundColor:'#0f172a',
titleColor:'#ffffff',
bodyColor:'#ffffff',
padding:12,
cornerRadius:8,
displayColors:true,
callbacks:{
title:function(context){
let indice=context[0].dataIndex
let ativo=ativos[indice]
return ativo.codigo+' • '+ativo.empresa
},
label:function(context){
let valor=Number(context.raw)||0
let percentual=totalInvestido>0?(valor/totalInvestido)*100:0
return brl(valor)+' • '+percentual.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'
}
}
},
/*=========================================================
RÓTULOS NAS FATIAS
=========================================================*/
datalabels:{
display:function(context){
let valor=Number(context.dataset.data[context.dataIndex])||0
if(totalInvestido<=0)return false
let percentual=(valor/totalInvestido)*100
return percentual>=5
},
formatter:function(valor,context){
let percentual=totalInvestido>0?(Number(valor)/totalInvestido)*100:0
let codigo=context.chart.data.labels[context.dataIndex]
return codigo+'\n'+percentual.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'
},
color:'#ffffff',
textAlign:'center',
anchor:'center',
align:'center',
clamp:true,
font:function(context){
let valor=Number(context.dataset.data[context.dataIndex])||0
let percentual=totalInvestido>0?(valor/totalInvestido)*100:0
return{
weight:'700',
size:percentual>=15?12:11
}
},
textStrokeWidth:0
}
}
}
})
}
/*=========================================================
018 SALVAR OPERAÇÃO
=========================================================*/
async function salvarOperacao(){
let data=document.getElementById('opData')
let empresa=document.getElementById('opEmpresa')
let codigo=document.getElementById('opCodigo')
let tipo=document.getElementById('opTipo')
let qtd=document.getElementById('opQtd')
let preco=document.getElementById('opPreco')
let obj={
data:data?.value||'',
empresa:String(empresa?.value||'').trim(),
codigo:String(codigo?.value||'').trim().toUpperCase(),
tipo:tipo?.value||'Compra',
quantidade:Number(qtd?.value),
preco_unitario:Number(preco?.value)
}
if(obj.empresa==='__NOVO__'||obj.codigo==='__NOVO__'){
alert('Cadastre o novo ativo antes de salvar a operação.')
return
}
if(!obj.data||!obj.empresa||!obj.codigo||!Number.isFinite(obj.quantidade)||obj.quantidade<=0||!Number.isFinite(obj.preco_unitario)||obj.preco_unitario<=0){
alert('Preencha corretamente todos os campos da operação.')
return
}
let ativo=ATIVOS.find(a=>a.codigo===obj.codigo)
if(!ativo){
alert('O ativo selecionado não está cadastrado.')
return
}
obj.empresa=ativo.empresa
avisar('Salvando operação…')
let r=await db.from('nemesio_operacoes').insert(obj)
if(r.error){
console.error('Erro ao salvar operação:',r.error)
alert('Erro ao salvar operação:\n'+r.error.message)
avisar('Erro ao salvar operação')
return
}
if(empresa)empresa.value=''
if(codigo)codigo.value=''
if(qtd)qtd.value=''
if(preco)preco.value=''
if(data)data.value=hoje()
await carregar()
}
/*=========================================================
019 EXCLUIR OPERAÇÃO
=========================================================*/
async function excluirOperacao(id){
if(!confirm('Tem certeza que deseja excluir esta operação?'))return
avisar('Excluindo operação…')
let r=await db.from('nemesio_operacoes').delete().eq('id',id)
if(r.error){
console.error('Erro ao excluir operação:',r.error)
alert(r.error.message)
avisar('Erro ao excluir operação')
return
}
await carregar()
}
/*=========================================================
020 SALVAR TAXA
=========================================================*/
async function salvarTaxa(){
let data=document.getElementById('txData')
let liq=document.getElementById('txLiq')
let neg=document.getElementById('txNeg')
let irrf=document.getElementById('txIrrf')
let obj={
data:data?.value||'',
taxa_liquidacao:Number(liq?.value||0),
taxa_negociacao:Number(neg?.value||0),
irrf:Number(irrf?.value||0)
}
if(!obj.data){
alert('Informe a data.')
return
}
avisar('Salvando taxas…')
let r=await db.from('nemesio_taxas').upsert(obj,{onConflict:'data'})
if(r.error){
console.error('Erro ao salvar taxas:',r.error)
alert(r.error.message)
avisar('Erro ao salvar taxas')
return
}
await carregar()
}
/*=========================================================
021 EXCLUIR TAXA
=========================================================*/
async function excluirTaxa(id){
if(!confirm('Tem certeza que deseja excluir estas taxas?'))return
avisar('Excluindo taxas…')
let r=await db.from('nemesio_taxas').delete().eq('id',id)
if(r.error){
console.error('Erro ao excluir taxas:',r.error)
alert(r.error.message)
avisar('Erro ao excluir taxas')
return
}
await carregar()
}
/*=========================================================
022 INICIALIZAÇÃO
=========================================================*/
function inicializar(){
let campoOpData=document.getElementById('opData')
let campoTxData=document.getElementById('txData')
if(campoOpData)campoOpData.value=hoje()
if(campoTxData)campoTxData.value=hoje()
atualizarVisibilidadeValores()
carregar()
}
if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',inicializar)
}else{
inicializar()
}
