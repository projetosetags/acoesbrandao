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
/* IRRF NÃO ENTRA NO TOTAL DAS TAXAS */
let taxasTotal=0
for(const t of TAXAS){
if(!t.data)continue
let m=String(t.data).slice(0,7)
if(!mensal[m]){
mensal[m]={mes:m,compras:0,vendas:0,lucro:0,taxas:0}
}
let taxa=
(Number(t.taxa_liquidacao)||0)+
(Number(t.taxa_negociacao)||0)
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
let kIRRF=document.getElementById('kIRRF')
let kCompras=document.getElementById('kCompras')
let kVendas=document.getElementById('kVendas')
if(kInvestido)kInvestido.dataset.valor=brl(CALC.investido)
if(kQtd)kQtd.textContent=num(CALC.qtd)
if(kLucro)kLucro.dataset.valor=brl(CALC.realizado)
if(kTaxas)kTaxas.textContent=brl(CALC.taxasTotal)
if(kIRRF)kIRRF.textContent=brl(calcularTotalIRRF())
if(kCompras)kCompras.dataset.valor=brl(CALC.compras)
if(kVendas)kVendas.dataset.valor=brl(CALC.vendas)
atualizarVisibilidadeValores()
renderCarteira()
renderOperacoes()
renderMensal()
renderTaxas()
renderIRRF()
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
if(!CALC)return
let rows=CALC.carteira.map(a=>`
<tr>
<td class="carteira-empresa"><b>${escaparHTML(a.empresa)}</b></td>
<td class="carteira-codigo"><b>${escaparHTML(a.codigo)}</b></td>
<td class="right carteira-qtd">${num(a.qtd)}</td>
<td class="right carteira-valor">${brl(a.custo)}</td>
<td class="right carteira-valor">${brl(a.pm)}</td>
<td class="right carteira-resultado ${a.realizado>=0?'pos':'neg'}">${brl(a.realizado)}</td>
<td class="right carteira-operacoes">${a.operacoes}</td>
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
}).sort((a,b)=>{
let dataA=String(a.data||'')
let dataB=String(b.data||'')
if(dataA!==dataB)return dataB.localeCompare(dataA)
return Number(b.id||0)-Number(a.id||0)
})
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
box.innerHTML=tabela([
'Data',
'Empresa',
'Código',
'Tipo',
'Qtd.',
'Preço',
'Valor bruto',
''
],rows)
}
}
/*=========================================================
015 RENDERIZAR RESULTADO MENSAL
=========================================================*/
function renderMensal(){
let irrfPorMes={}
TAXAS.forEach(t=>{
if(!t.data)return
let mes=String(t.data).slice(0,7)
irrfPorMes[mes]=(irrfPorMes[mes]||0)+(Number(t.irrf)||0)
})
let rows=[...CALC.mensal].reverse().map(x=>{
let irrf=irrfPorMes[x.mes]||0
let resultadoFinal=Number(x.lucro||0)-Number(x.taxas||0)-irrf
return `<tr>
<td class="resultado-mes"><b>${mesBR(x.mes+'-01')}</b></td>
<td class="right resultado-valor">${brl(x.compras)}</td>
<td class="right resultado-valor">${brl(x.vendas)}</td>
<td class="right resultado-bruto ${x.lucro>=0?'pos':'neg'}">${brl(x.lucro)}</td>
<td class="right resultado-taxas">${brl(x.taxas)}</td>
<td class="right resultado-irrf">${brl(irrf)}</td>
<td class="right resultado-liquido ${resultadoFinal>=0?'pos':'neg'}">${brl(resultadoFinal)}</td>
</tr>`
})
let box=document.getElementById('tabelaMensal')
if(box){
box.innerHTML=tabela([
'Mês',
'Compras',
'Vendas',
'Resultado bruto',
'Taxas',
'IRRF',
'Resultado após Taxas + IRRF'
],rows)
}
}
/*=========================================================
016 RENDERIZAR TAXAS
=========================================================*/
function renderTaxas(){
let dados=[...TAXAS].sort((a,b)=>{
let dataA=String(a.data||'')
let dataB=String(b.data||'')
if(dataA!==dataB)return dataB.localeCompare(dataA)
return Number(b.id||0)-Number(a.id||0)
})
let rows=dados.map(t=>{
let liquidacao=Number(t.taxa_liquidacao)||0
let negociacao=Number(t.taxa_negociacao)||0
let total=liquidacao+negociacao
return `<tr>
<td><b>${dataBR(t.data)}</b></td>
<td class="right">${brl(liquidacao)}</td>
<td class="right">${brl(negociacao)}</td>
<td class="right"><b>${brl(total)}</b></td>
<td><button class="btn-excluir-mini" type="button" onclick="excluirTaxa(${Number(t.id)})" title="Excluir taxas operacionais">Excluir</button></td>
</tr>`
})
let box=document.getElementById('tabelaTaxas')
if(box){
box.innerHTML=tabela([
'Data',
'Liquidação',
'Negociação',
'Total',
''
],rows)
}
}
/*=========================================================
RENDERIZAR IRRF
=========================================================*/
function renderIRRF(){
let dados=[...TAXAS].filter(t=>(Number(t.irrf)||0)!==0).sort((a,b)=>{
let dataA=String(a.data||'')
let dataB=String(b.data||'')
if(dataA!==dataB)return dataB.localeCompare(dataA)
return Number(b.id||0)-Number(a.id||0)
})
let rows=dados.map(t=>{
let irrf=Number(t.irrf)||0
return `<tr>
<td><b>${dataBR(t.data)}</b></td>
<td class="right irrf-valor">${brl(irrf)}</td>
<td><button class="btn-excluir-mini" type="button" onclick="excluirIRRF(${Number(t.id)})" title="Excluir IRRF">Excluir</button></td>
</tr>`
})
let box=document.getElementById('tabelaIRRF')
if(box){
box.innerHTML=tabela(['Data','IRRF',''],rows)
}
}
/*=========================================================
XXX GRÁFICOS DO RESUMO - HORIZONTAL + PIZZA COLORIDA
=========================================================*/
function renderGraficos(){
if(!CALC)return
if(window.grafResultadoObj){
window.grafResultadoObj.destroy()
window.grafResultadoObj=null
}
if(window.grafCarteiraObj){
window.grafCarteiraObj.destroy()
window.grafCarteiraObj=null
}
/*=========================================================
GRÁFICO 1 - RESULTADO MENSAL EM BARRAS HORIZONTAIS
=========================================================*/
let meses=CALC.mensal||[]
let mesesGrafico=[...meses].reverse()
let labelsResultado=mesesGrafico.map(x=>x.mesLabel||x.mes||'')
let valoresResultado=mesesGrafico.map(x=>{
let bruto=Number(x.resultado||x.resultadoBruto||0)
let taxas=Number(x.taxas||0)
let irrf=Number(x.irrf||0)
return bruto-taxas-irrf
})
let coresResultado=valoresResultado.map((valor,i)=>{
if(valor>0){
let verdes=[
'#16a34a',
'#22c55e',
'#15803d',
'#4ade80',
'#166534',
'#059669'
]
return verdes[i%verdes.length]
}
if(valor<0){
let vermelhos=[
'#dc2626',
'#ef4444',
'#b91c1c',
'#f87171',
'#991b1b',
'#e11d48'
]
return vermelhos[i%vermelhos.length]
}
return '#94a3b8'
})
let canvasResultado=document.getElementById('grafResultado')
if(canvasResultado){
window.grafResultadoObj=new Chart(canvasResultado,{
type:'bar',
data:{
labels:labelsResultado,
datasets:[{
label:'Resultado após Taxas + IRRF',
data:valoresResultado,
backgroundColor:coresResultado,
borderColor:coresResultado,
borderWidth:1,
borderRadius:7,
borderSkipped:false,
barPercentage:.72,
categoryPercentage:.78
}]
},
options:{
indexAxis:'y',
responsive:true,
maintainAspectRatio:false,
animation:{
duration:700
},
interaction:{
mode:'nearest',
axis:'y',
intersect:false
},
layout:{
padding:{
top:8,
right:65,
bottom:5,
left:5
}
},
plugins:{
legend:{
display:false
},
tooltip:{
callbacks:{
label:function(context){
return ' '+moeda(Number(context.raw||0))
}
}
},
datalabels:{
display:true,
anchor:function(context){
return Number(context.dataset.data[context.dataIndex]||0)>=0?'end':'start'
},
align:function(context){
return Number(context.dataset.data[context.dataIndex]||0)>=0?'right':'left'
},
offset:5,
clamp:true,
clip:false,
color:function(context){
let valor=Number(context.dataset.data[context.dataIndex]||0)
if(valor>0)return '#15803d'
if(valor<0)return '#dc2626'
return '#64748b'
},
font:{
size:10,
weight:'800'
},
formatter:function(valor){
return moeda(valor)
}
}
},
scales:{
x:{
beginAtZero:true,
grid:{
color:'#e2e8f0',
drawBorder:false
},
border:{
display:false
},
ticks:{
color:'#64748b',
font:{
size:10
},
callback:function(value){
let n=Number(value||0)
if(Math.abs(n)>=1000000)return 'R$ '+(n/1000000).toFixed(1).replace('.',',')+' mi'
if(Math.abs(n)>=1000)return 'R$ '+(n/1000).toFixed(1).replace('.',',')+' mil'
return 'R$ '+n.toLocaleString('pt-BR')
}
}
},
y:{
grid:{
display:false
},
border:{
display:false
},
ticks:{
color:'#334155',
font:{
size:11,
weight:'700'
}
}
}
}
},
plugins:[ChartDataLabels]
})
}
/*=========================================================
GRÁFICO 2 - CAPITAL INVESTIDO POR ATIVO EM PIZZA
=========================================================*/
let carteira=(CALC.carteira||[]).filter(x=>Number(x.qtd||x.quantidade||0)>0)
let labelsCarteira=carteira.map(x=>x.codigo||x.ativo||x.empresa||'Ativo')
let valoresCarteira=carteira.map(x=>{
let qtd=Number(x.qtd||x.quantidade||0)
let medio=Number(x.precoMedio||x.preco_medio||x.pm||0)
let custo=Number(x.custoAtual||x.custo_atual||0)
return custo>0?custo:qtd*medio
})
let paletaCarteira=[
'#2563eb',
'#16a34a',
'#f59e0b',
'#dc2626',
'#7c3aed',
'#0891b2',
'#ea580c',
'#db2777',
'#4f46e5',
'#65a30d',
'#0d9488',
'#9333ea',
'#0284c7',
'#d97706',
'#be123c',
'#475569',
'#059669',
'#c026d3',
'#0369a1',
'#84cc16'
]
let coresCarteira=labelsCarteira.map((_,i)=>paletaCarteira[i%paletaCarteira.length])
let canvasCarteira=document.getElementById('grafCarteira')
if(canvasCarteira){
window.grafCarteiraObj=new Chart(canvasCarteira,{
type:'doughnut',
data:{
labels:labelsCarteira,
datasets:[{
data:valoresCarteira,
backgroundColor:coresCarteira,
borderColor:'#ffffff',
borderWidth:3,
hoverBorderWidth:4,
hoverOffset:8
}]
},
options:{
responsive:true,
maintainAspectRatio:false,
cutout:'54%',
animation:{
animateRotate:true,
animateScale:true,
duration:800
},
layout:{
padding:8
},
plugins:{
legend:{
display:true,
position:'right',
labels:{
usePointStyle:true,
pointStyle:'circle',
boxWidth:9,
boxHeight:9,
padding:12,
color:'#334155',
font:{
size:10,
weight:'700'
},
generateLabels:function(chart){
let data=chart.data
if(!data.labels.length)return[]
let total=data.datasets[0].data.reduce((s,v)=>s+Number(v||0),0)
return data.labels.map((label,i)=>{
let valor=Number(data.datasets[0].data[i]||0)
let percentual=total>0?(valor/total)*100:0
return{
text:label+' • '+percentual.toFixed(1).replace('.',',')+'%',
fillStyle:data.datasets[0].backgroundColor[i],
strokeStyle:data.datasets[0].backgroundColor[i],
lineWidth:0,
hidden:false,
index:i,
pointStyle:'circle'
}
})
}
}
},
tooltip:{
callbacks:{
label:function(context){
let valor=Number(context.raw||0)
let total=context.dataset.data.reduce((s,v)=>s+Number(v||0),0)
let percentual=total>0?(valor/total)*100:0
return ' '+context.label+': '+moeda(valor)+' ('+percentual.toFixed(1).replace('.',',')+'%)'
}
}
},
datalabels:{
display:function(context){
let valores=context.dataset.data
let total=valores.reduce((s,v)=>s+Number(v||0),0)
let valor=Number(valores[context.dataIndex]||0)
let percentual=total>0?(valor/total)*100:0
return percentual>=4
},
color:'#ffffff',
font:{
size:10,
weight:'900'
},
textStrokeColor:'rgba(15,23,42,.35)',
textStrokeWidth:2,
formatter:function(valor,context){
let total=context.dataset.data.reduce((s,v)=>s+Number(v||0),0)
let percentual=total>0?(Number(valor||0)/total)*100:0
return percentual.toFixed(1).replace('.',',')+'%'
}
}
}
},
plugins:[ChartDataLabels]
})
}
}
/*=========================================================
019 SALVAR OPERAÇÃO
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
if(
!obj.data||
!obj.empresa||
!obj.codigo||
!Number.isFinite(obj.quantidade)||
obj.quantidade<=0||
!Number.isFinite(obj.preco_unitario)||
obj.preco_unitario<=0
){
alert('Preencha corretamente todos os campos da operação.')
return
}
let ativo=ATIVOS.find(a=>String(a.codigo||'').toUpperCase()===obj.codigo)
if(!ativo){
alert('O ativo selecionado não está cadastrado.')
return
}
obj.empresa=ativo.empresa
avisar('Salvando operação…')
try{
let r=await db
.from('nemesio_operacoes')
.insert(obj)
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
if(tipo)tipo.value='Compra'
if(data)data.value=hoje()
await carregar()
avisar('Operação salva com sucesso')
}catch(erro){
console.error('Erro inesperado ao salvar operação:',erro)
alert('Não foi possível salvar a operação.')
avisar('Erro ao salvar operação')
}
}
/*=========================================================
020 EXCLUIR OPERAÇÃO
=========================================================*/
async function excluirOperacao(id){
if(!id)return
if(!confirm('Tem certeza que deseja excluir esta operação?'))return
avisar('Excluindo operação…')
try{
let r=await db
.from('nemesio_operacoes')
.delete()
.eq('id',id)
if(r.error){
console.error('Erro ao excluir operação:',r.error)
alert('Erro ao excluir operação:\n'+r.error.message)
avisar('Erro ao excluir operação')
return
}
await carregar()
avisar('Operação excluída')
}catch(erro){
console.error('Erro inesperado ao excluir operação:',erro)
alert('Não foi possível excluir a operação.')
avisar('Erro ao excluir operação')
}
}
/*=========================================================
021 BUSCAR REGISTRO DE TAXAS POR DATA
=========================================================*/
async function buscarTaxaPorData(data){
if(!data)return null
let r=await db
.from('nemesio_taxas')
.select('*')
.eq('data',data)
.maybeSingle()
if(r.error){
console.error('Erro ao consultar taxas:',r.error)
throw r.error
}
return r.data||null
}
/*=========================================================
022 SALVAR TAXAS
IRRF NÃO É ALTERADO NESTA FUNÇÃO
=========================================================*/
async function salvarTaxa(){
let data=document.getElementById('txData')
let liq=document.getElementById('txLiq')
let neg=document.getElementById('txNeg')
let dataValor=data?.value||''
let liquidacao=Number(liq?.value||0)
let negociacao=Number(neg?.value||0)
if(!dataValor){
alert('Informe a data.')
return
}
if(!Number.isFinite(liquidacao)||liquidacao<0){
alert('Informe corretamente a taxa de liquidação.')
return
}
if(!Number.isFinite(negociacao)||negociacao<0){
alert('Informe corretamente a taxa de negociação.')
return
}
avisar('Salvando taxas…')
try{
let existente=await buscarTaxaPorData(dataValor)
let r
if(existente){
r=await db
.from('nemesio_taxas')
.update({
taxa_liquidacao:liquidacao,
taxa_negociacao:negociacao
})
.eq('id',existente.id)
}else{
r=await db
.from('nemesio_taxas')
.insert({
data:dataValor,
taxa_liquidacao:liquidacao,
taxa_negociacao:negociacao,
irrf:0
})
}
if(r.error){
console.error('Erro ao salvar taxas:',r.error)
alert('Erro ao salvar taxas:\n'+r.error.message)
avisar('Erro ao salvar taxas')
return
}
if(liq)liq.value='0'
if(neg)neg.value='0'
if(data)data.value=hoje()
await carregar()
avisar('Taxas salvas com sucesso')
}catch(erro){
console.error('Erro inesperado ao salvar taxas:',erro)
alert('Não foi possível salvar as taxas.')
avisar('Erro ao salvar taxas')
}
}
/*=========================================================
023 EXCLUIR TAXAS
MANTÉM O IRRF DO MESMO REGISTRO
=========================================================*/
async function excluirTaxa(id){
if(!id)return
if(!confirm('Tem certeza que deseja excluir estas taxas operacionais?'))return
avisar('Excluindo taxas…')
try{
let consulta=await db
.from('nemesio_taxas')
.select('*')
.eq('id',id)
.maybeSingle()
if(consulta.error){
console.error('Erro ao consultar registro:',consulta.error)
alert('Erro ao consultar o registro:\n'+consulta.error.message)
avisar('Erro ao excluir taxas')
return
}
let registro=consulta.data
if(!registro){
alert('Registro não encontrado.')
await carregar()
return
}
let irrf=Number(registro.irrf)||0
let r
if(irrf!==0){
r=await db
.from('nemesio_taxas')
.update({
taxa_liquidacao:0,
taxa_negociacao:0
})
.eq('id',id)
}else{
r=await db
.from('nemesio_taxas')
.delete()
.eq('id',id)
}
if(r.error){
console.error('Erro ao excluir taxas:',r.error)
alert('Erro ao excluir taxas:\n'+r.error.message)
avisar('Erro ao excluir taxas')
return
}
await carregar()
avisar('Taxas excluídas')
}catch(erro){
console.error('Erro inesperado ao excluir taxas:',erro)
alert('Não foi possível excluir as taxas.')
avisar('Erro ao excluir taxas')
}
}
/*=========================================================
024 SALVAR IRRF
TAXAS OPERACIONAIS NÃO SÃO ALTERADAS
=========================================================*/
async function salvarIRRF(){
let data=document.getElementById('irrfData')
let campoValor=document.getElementById('irrfValor')
let dataValor=data?.value||''
let valor=Number(campoValor?.value||0)
if(!dataValor){
alert('Informe a data.')
return
}
if(!Number.isFinite(valor)||valor<0){
alert('Informe corretamente o valor do IRRF.')
return
}
avisar('Salvando IRRF…')
try{
let existente=await buscarTaxaPorData(dataValor)
let r
if(existente){
r=await db
.from('nemesio_taxas')
.update({
irrf:valor
})
.eq('id',existente.id)
}else{
r=await db
.from('nemesio_taxas')
.insert({
data:dataValor,
taxa_liquidacao:0,
taxa_negociacao:0,
irrf:valor
})
}
if(r.error){
console.error('Erro ao salvar IRRF:',r.error)
alert('Erro ao salvar IRRF:\n'+r.error.message)
avisar('Erro ao salvar IRRF')
return
}
if(campoValor)campoValor.value='0'
if(data)data.value=hoje()
await carregar()
avisar('IRRF salvo com sucesso')
}catch(erro){
console.error('Erro inesperado ao salvar IRRF:',erro)
alert('Não foi possível salvar o IRRF.')
avisar('Erro ao salvar IRRF')
}
}
/*=========================================================
025 EXCLUIR IRRF
MANTÉM AS TAXAS OPERACIONAIS DO MESMO REGISTRO
=========================================================*/
async function excluirIRRF(id){
if(!id)return
if(!confirm('Tem certeza que deseja excluir este IRRF?'))return
avisar('Excluindo IRRF…')
try{
let consulta=await db
.from('nemesio_taxas')
.select('*')
.eq('id',id)
.maybeSingle()
if(consulta.error){
console.error('Erro ao consultar registro:',consulta.error)
alert('Erro ao consultar o registro:\n'+consulta.error.message)
avisar('Erro ao excluir IRRF')
return
}
let registro=consulta.data
if(!registro){
alert('Registro não encontrado.')
await carregar()
return
}
let liquidacao=Number(registro.taxa_liquidacao)||0
let negociacao=Number(registro.taxa_negociacao)||0
let r
if(liquidacao!==0||negociacao!==0){
r=await db
.from('nemesio_taxas')
.update({
irrf:0
})
.eq('id',id)
}else{
r=await db
.from('nemesio_taxas')
.delete()
.eq('id',id)
}
if(r.error){
console.error('Erro ao excluir IRRF:',r.error)
alert('Erro ao excluir IRRF:\n'+r.error.message)
avisar('Erro ao excluir IRRF')
return
}
await carregar()
avisar('IRRF excluído')
}catch(erro){
console.error('Erro inesperado ao excluir IRRF:',erro)
alert('Não foi possível excluir o IRRF.')
avisar('Erro ao excluir IRRF')
}
}
/*=========================================================
026 TOTAL DE IRRF
=========================================================*/
function calcularTotalIRRF(){
return TAXAS.reduce((total,t)=>{
return total+(Number(t.irrf)||0)
},0)
}
/*=========================================================
027 OBTER PAINÉIS SELECIONADOS PARA PDF
=========================================================*/
function obterPaineisPDFSelecionados(){
return{
resumo:document.getElementById('pdfResumo')?.checked===true,
carteira:document.getElementById('pdfCarteira')?.checked===true,
operacoes:document.getElementById('pdfOperacoes')?.checked===true,
resultados:document.getElementById('pdfResultados')?.checked===true,
taxas:document.getElementById('pdfTaxas')?.checked===true,
irrf:document.getElementById('pdfIRRF')?.checked===true
}
}
/*=========================================================
028 EXISTE PAINEL SELECIONADO
=========================================================*/
function existePainelPDFSelecionado(selecionados){
return Object.values(selecionados||{}).some(Boolean)
}
/*=========================================================
029 FORMATAR NÚMERO PARA PDF
=========================================================*/
function numeroPDF(valor,casas=2){
return(Number(valor)||0).toLocaleString('pt-BR',{
minimumFractionDigits:casas,
maximumFractionDigits:casas
})
}
/*=========================================================
030 FORMATAR MOEDA PARA PDF
=========================================================*/
function moedaPDF(valor){
return(Number(valor)||0).toLocaleString('pt-BR',{
style:'currency',
currency:'BRL'
})
}
/*=========================================================
031 TEXTO SEGURO PARA PDF
=========================================================*/
function textoPDF(valor){
if(valor===null||valor===undefined)return''
return String(valor)
}
/*=========================================================
032 CRIAR NOVA PÁGINA PDF
=========================================================*/
function novaPaginaPDF(doc,titulo){
doc.addPage()
cabecalhoPDF(doc,titulo)
return 34
}
/*=========================================================
033 CABEÇALHO DO PDF
=========================================================*/
function cabecalhoPDF(doc,titulo){
let largura=doc.internal.pageSize.getWidth()
doc.setFillColor(15,23,42)
doc.rect(0,0,largura,23,'F')
doc.setTextColor(255,255,255)
doc.setFont('helvetica','bold')
doc.setFontSize(15)
doc.text('Nemésio G Brandão',14,10)
doc.setFont('helvetica','normal')
doc.setFontSize(9)
doc.text('Controle de Ações',14,16)
doc.setFont('helvetica','bold')
doc.setFontSize(10)
doc.text(textoPDF(titulo),largura-14,13,{align:'right'})
doc.setTextColor(15,23,42)
}
/*=========================================================
034 RODAPÉ E NUMERAÇÃO DO PDF
=========================================================*/
function aplicarRodapesPDF(doc){
let paginas=doc.internal.getNumberOfPages()
for(let i=1;i<=paginas;i++){
doc.setPage(i)
let largura=doc.internal.pageSize.getWidth()
let altura=doc.internal.pageSize.getHeight()
doc.setDrawColor(226,232,240)
doc.line(14,altura-12,largura-14,altura-12)
doc.setFont('helvetica','normal')
doc.setFontSize(7.5)
doc.setTextColor(100,116,139)
doc.text(
'Gerado em '+new Date().toLocaleString('pt-BR'),
14,
altura-7
)
doc.text(
'Página '+i+' de '+paginas,
largura-14,
altura-7,
{align:'right'}
)
}
}
/*=========================================================
035 VERIFICAR AUTOTABLE
=========================================================*/
function verificarAutoTablePDF(doc){
return(
typeof doc.autoTable==='function'||
(typeof window.jspdfAutoTable!=='undefined'&&typeof window.jspdfAutoTable.autoTable==='function')
)
}
/*=========================================================
036 ADICIONAR TÍTULO DE SEÇÃO NO PDF
=========================================================*/
function tituloSecaoPDF(doc,titulo,y){
doc.setTextColor(15,23,42)
doc.setFont('helvetica','bold')
doc.setFontSize(13)
doc.text(textoPDF(titulo),14,y)
doc.setDrawColor(203,213,225)
doc.line(14,y+3,doc.internal.pageSize.getWidth()-14,y+3)
return y+9
}
/*=========================================================
037 ADICIONAR TABELA NO PDF
=========================================================*/
function tabelaPDF(doc,cabecalho,linhas,y,opcoes={}){
let configuracao={
startY:y,
head:[cabecalho],
body:linhas,
theme:'grid',
margin:{
left:14,
right:14,
bottom:18
},
styles:{
font:'helvetica',
fontSize:7.5,
cellPadding:2.2,
textColor:[51,65,85],
lineColor:[226,232,240],
lineWidth:.15,
overflow:'linebreak',
valign:'middle'
},
headStyles:{
fillColor:[241,245,249],
textColor:[51,65,85],
fontStyle:'bold',
lineColor:[203,213,225],
lineWidth:.2
},
alternateRowStyles:{
fillColor:[248,250,252]
},
...opcoes
}
if(typeof doc.autoTable==='function'){
doc.autoTable(configuracao)
return doc.lastAutoTable?.finalY||y
}
if(
typeof window.jspdfAutoTable!=='undefined'&&
typeof window.jspdfAutoTable.autoTable==='function'
){
window.jspdfAutoTable.autoTable(doc,configuracao)
return doc.lastAutoTable?.finalY||y
}
throw new Error('jsPDF AutoTable não foi carregado.')
}
/*=========================================================
038 CONVERTER CANVAS EM IMAGEM PARA PDF
=========================================================*/
function canvasImagemPDF(id){
let canvas=document.getElementById(id)
if(!canvas)return null
try{
return canvas.toDataURL('image/png',1)
}catch(erro){
console.warn('Não foi possível converter gráfico:',id,erro)
return null
}
}
/*=========================================================
058 ALTERNAR PERÍODO DO PDF
=========================================================*/
function alternarPeriodoPDF(){
let todos=document.getElementById('pdfTodoPeriodo')
let inicial=document.getElementById('pdfDataInicial')
let final=document.getElementById('pdfDataFinal')
let usarTodos=todos?.checked!==false
if(inicial)inicial.disabled=usarTodos
if(final)final.disabled=usarTodos
atualizarResumoFiltrosPDF()
}
/*=========================================================
059 ALTERNAR ATIVOS DO PDF
=========================================================*/
function alternarAtivosPDF(){
let todos=document.getElementById('pdfTodosAtivos')
let busca=document.getElementById('pdfBuscaAtivo')
let lista=document.getElementById('pdfListaAtivos')
let marcar=document.getElementById('btnPDFMarcarAtivos')
let limpar=document.getElementById('btnPDFLimparAtivos')
let usarTodos=todos?.checked!==false
if(busca)busca.disabled=usarTodos
if(marcar)marcar.disabled=usarTodos
if(limpar)limpar.disabled=usarTodos
if(lista){
lista.classList.toggle('pdf-lista-desabilitada',usarTodos)
}
renderAtivosPDF()
atualizarResumoFiltrosPDF()
}
/*=========================================================
060 LISTA DE ATIVOS PARA PDF
=========================================================*/
function obterAtivosDisponiveisPDF(){
let mapa=new Map()
ATIVOS.forEach(a=>{
let codigo=String(a.codigo||'').trim().toUpperCase()
let empresa=String(a.empresa||'').trim()
if(codigo){
mapa.set(codigo,{codigo,empresa})
}
})
OPERACOES.forEach(o=>{
let codigo=String(o.codigo||'').trim().toUpperCase()
let empresa=String(o.empresa||'').trim()
if(codigo&&!mapa.has(codigo)){
mapa.set(codigo,{codigo,empresa})
}
})
return[...mapa.values()].sort((a,b)=>
a.codigo.localeCompare(b.codigo,'pt-BR')
)
}
/*=========================================================
061 RENDERIZAR ATIVOS DO PDF
=========================================================*/
function renderAtivosPDF(){
let box=document.getElementById('pdfListaAtivos')
if(!box)return
let todos=document.getElementById('pdfTodosAtivos')
let desabilitado=todos?.checked!==false
let busca=String(
document.getElementById('pdfBuscaAtivo')?.value||''
).trim().toLowerCase()
let selecionadosAntes=new Set(
[...document.querySelectorAll('.pdf-ativo-checkbox:checked')]
.map(x=>x.value)
)
let ativos=obterAtivosDisponiveisPDF()
.filter(a=>{
if(!busca)return true
return(
a.codigo.toLowerCase().includes(busca)||
a.empresa.toLowerCase().includes(busca)
)
})
if(!ativos.length){
box.innerHTML='<div class="pdf-sem-ativos">Nenhum ativo encontrado.</div>'
return
}
box.innerHTML=ativos.map(a=>`
<label class="pdf-ativo-item">
<input
type="checkbox"
class="pdf-ativo-checkbox"
value="${escaparHTML(a.codigo)}"
${selecionadosAntes.has(a.codigo)?'checked':''}
${desabilitado?'disabled':''}
onchange="atualizarResumoFiltrosPDF()">
<span class="pdf-ativo-dados">
<strong>${escaparHTML(a.codigo)}</strong>
<span>${escaparHTML(a.empresa)}</span>
</span>
</label>
`).join('')
}
/*=========================================================
062 FILTRAR ATIVOS PDF
=========================================================*/
function filtrarAtivosPDF(){
renderAtivosPDF()
}
/*=========================================================
063 MARCAR TODOS OS ATIVOS PDF
=========================================================*/
function marcarTodosAtivosPDF(){
document.querySelectorAll('.pdf-ativo-checkbox').forEach(c=>{
if(!c.disabled)c.checked=true
})
atualizarResumoFiltrosPDF()
}
/*=========================================================
064 DESMARCAR TODOS OS ATIVOS PDF
=========================================================*/
function desmarcarTodosAtivosPDF(){
document.querySelectorAll('.pdf-ativo-checkbox').forEach(c=>{
if(!c.disabled)c.checked=false
})
atualizarResumoFiltrosPDF()
}
/*=========================================================
065 OBTER FILTROS DO PDF
=========================================================*/
function obterFiltrosPDF(){
let todoPeriodo=document.getElementById('pdfTodoPeriodo')?.checked!==false
let todosAtivos=document.getElementById('pdfTodosAtivos')?.checked!==false
let dataInicial=todoPeriodo
?''
:String(document.getElementById('pdfDataInicial')?.value||'')
let dataFinal=todoPeriodo
?''
:String(document.getElementById('pdfDataFinal')?.value||'')
let ativos=todosAtivos
?[]
:[...document.querySelectorAll('.pdf-ativo-checkbox:checked')]
.map(c=>String(c.value||'').trim().toUpperCase())
return{
todoPeriodo,
todosAtivos,
dataInicial,
dataFinal,
ativos
}
}
/*=========================================================
066 VALIDAR FILTROS PDF
=========================================================*/
function validarFiltrosPDF(f){
if(!f.todoPeriodo){
if(!f.dataInicial||!f.dataFinal){
alert('Informe a data inicial e a data final do relatório.')
return false
}
if(f.dataInicial>f.dataFinal){
alert('A data inicial não pode ser posterior à data final.')
return false
}
}
if(!f.todosAtivos&&!f.ativos.length){
alert('Selecione pelo menos uma ação/ativo para gerar o relatório.')
return false
}
return true
}
/*=========================================================
067 TESTAR REGISTRO NO PERÍODO
=========================================================*/
function registroNoPeriodoPDF(data,f){
if(f.todoPeriodo)return true
let d=String(data||'').slice(0,10)
if(!d)return false
return d>=f.dataInicial&&d<=f.dataFinal
}
/*=========================================================
068 TESTAR ATIVO SELECIONADO
=========================================================*/
function ativoSelecionadoPDF(codigo,f){
if(f.todosAtivos)return true
return f.ativos.includes(
String(codigo||'').trim().toUpperCase()
)
}
/*=========================================================
069 FILTRAR OPERAÇÕES PARA PDF
=========================================================*/
function obterOperacoesFiltradasPDF(f){
return OPERACOES.filter(o=>
registroNoPeriodoPDF(o.data,f)&&
ativoSelecionadoPDF(o.codigo,f)
)
}
/*=========================================================
070 CALCULAR DADOS FILTRADOS DO PDF
=========================================================*/
function calcularPDF(f){
let originais=OPERACOES
try{
OPERACOES=obterOperacoesFiltradasPDF(f)
return calcular()
}finally{
OPERACOES=originais
}
}
/*=========================================================
071 ATUALIZAR RESUMO DOS FILTROS PDF
=========================================================*/
function atualizarResumoFiltrosPDF(){
let f=obterFiltrosPDF()
let periodo=document.getElementById('pdfResumoPeriodo')
let ativos=document.getElementById('pdfResumoAtivos')
let conteudo=document.getElementById('pdfResumoConteudo')
let descricao=document.getElementById('pdfPeriodoDescricao')
if(periodo){
periodo.textContent=f.todoPeriodo
?'Todo o período'
:(f.dataInicial&&f.dataFinal
?dataBR(f.dataInicial)+' a '+dataBR(f.dataFinal)
:'Defina as datas')
}
if(descricao){
descricao.textContent=f.todoPeriodo
?'Todos os registros serão considerados.'
:(f.dataInicial&&f.dataFinal
?'Serão considerados registros de '+dataBR(f.dataInicial)+' até '+dataBR(f.dataFinal)+'.'
:'Informe a data inicial e final.')
}
if(ativos){
ativos.textContent=f.todosAtivos
?'Todas'
:(f.ativos.length
?f.ativos.join(', ')
:'Nenhuma selecionada')
}
if(conteudo){
let nomes=[]
if(document.getElementById('pdfResumo')?.checked)nomes.push('Resumo')
if(document.getElementById('pdfCarteira')?.checked)nomes.push('Carteira')
if(document.getElementById('pdfOperacoes')?.checked)nomes.push('Operações')
if(document.getElementById('pdfResultados')?.checked)nomes.push('Resultados')
if(document.getElementById('pdfTaxas')?.checked)nomes.push('Taxas')
if(document.getElementById('pdfIRRF')?.checked)nomes.push('IRRF')
conteudo.textContent=nomes.length?nomes.join(', '):'Nenhum'
}
}
/*=========================================================
039 EXPORTAR PDF SELECIONADO
=========================================================*/
async function exportarPDFSelecionado(){
if(!CALC){
alert('Aguarde o carregamento dos dados.')
return
}
let filtrosPDF=obterFiltrosPDF()
if(!validarFiltrosPDF(filtrosPDF))return
let OPERACOES_PDF=obterOperacoesFiltradasPDF(filtrosPDF)
let CALC_PDF=calcularPDF(filtrosPDF)
let selecionados=obterPaineisPDFSelecionados()
if(!existePainelPDFSelecionado(selecionados)){
alert('Marque pelo menos um painel para gerar o PDF.')
return
}
if(!window.jspdf||!window.jspdf.jsPDF){
alert('A biblioteca de geração de PDF não foi carregada.')
return
}
avisar('Gerando PDF…')
try{
let {jsPDF}=window.jspdf
let doc=new jsPDF({
orientation:'landscape',
unit:'mm',
format:'a4',
compress:true
})
if(!verificarAutoTablePDF(doc)){
throw new Error('A biblioteca jsPDF AutoTable não foi carregada.')
}
let primeiraSecao=true
function prepararSecao(titulo){
if(primeiraSecao){
cabecalhoPDF(doc,titulo)
primeiraSecao=false
return 34
}
return novaPaginaPDF(doc,titulo)
}
/*=========================================================
040 PDF - RESUMO
=========================================================*/
if(selecionados.resumo){
let y=prepararSecao('Resumo')
y=tituloSecaoPDF(doc,'Resumo geral',y)
let taxasPeriodo=TAXAS.filter(t=>registroNoPeriodoPDF(t.data,filtrosPDF))
let totalIRRF=taxasPeriodo.reduce((s,t)=>s+(Number(t.irrf)||0),0)
let resultadoAposTaxas=CALC_PDF.realizado-CALC_PDF.taxasTotal
let cards=[
['Valor investido',moedaPDF(CALC_PDF.investido)],
['Ações / Cotas',numeroPDF(CALC_PDF.qtd,2)],
['Lucro / Prejuízo acumulado',moedaPDF(CALC_PDF.realizado)],
['Taxas operacionais',moedaPDF(CALC_PDF.taxasTotal)],
['Compras',moedaPDF(CALC_PDF.compras)],
['Vendas',moedaPDF(CALC_PDF.vendas)],
['Resultado após taxas',moedaPDF(resultadoAposTaxas)],
['IRRF registrado',moedaPDF(totalIRRF)]
]
let largura=doc.internal.pageSize.getWidth()
let margem=14
let gap=4
let colunas=4
let larguraCard=(largura-(margem*2)-(gap*(colunas-1)))/colunas
let alturaCard=19
cards.forEach((item,i)=>{
let coluna=i%colunas
let linha=Math.floor(i/colunas)
let x=margem+coluna*(larguraCard+gap)
let cy=y+linha*(alturaCard+4)
doc.setFillColor(248,250,252)
doc.setDrawColor(226,232,240)
doc.roundedRect(x,cy,larguraCard,alturaCard,2,2,'FD')
doc.setFont('helvetica','bold')
doc.setFontSize(7.5)
doc.setTextColor(100,116,139)
doc.text(item[0].toUpperCase(),x+4,cy+6)
doc.setFontSize(11)
doc.setTextColor(15,23,42)
doc.text(item[1],x+4,cy+14)
})
y+=46
/*=========================================================
041 PDF - GRÁFICOS DO RESUMO
=========================================================*/
let imgResultado=canvasImagemPDF('grafResultado')
let imgCarteira=canvasImagemPDF('grafCarteira')
if(imgResultado||imgCarteira){
y=tituloSecaoPDF(doc,'Gráficos',y+3)
let larguraGraf=(largura-(margem*2)-6)/2
let alturaGraf=66
if(imgResultado){
doc.setDrawColor(226,232,240)
doc.roundedRect(margem,y,larguraGraf,alturaGraf,2,2,'S')
doc.setFont('helvetica','bold')
doc.setFontSize(8)
doc.setTextColor(51,65,85)
doc.text('Resultado realizado por mês',margem+4,y+6)
doc.addImage(
imgResultado,
'PNG',
margem+3,
y+9,
larguraGraf-6,
alturaGraf-12,
undefined,
'FAST'
)
}
if(imgCarteira){
let x2=margem+larguraGraf+6
doc.setDrawColor(226,232,240)
doc.roundedRect(x2,y,larguraGraf,alturaGraf,2,2,'S')
doc.setFont('helvetica','bold')
doc.setFontSize(8)
doc.setTextColor(51,65,85)
doc.text('Capital investido por ativo',x2+4,y+6)
doc.addImage(
imgCarteira,
'PNG',
x2+3,
y+9,
larguraGraf-6,
alturaGraf-12,
undefined,
'FAST'
)
}
y+=alturaGraf+7
}
/*=========================================================
042 PDF - RESUMO DA CARTEIRA
=========================================================*/
if(CALC_PDF.carteira.length){
if(y>155){
y=novaPaginaPDF(doc,'Resumo')
}
y=tituloSecaoPDF(doc,'Resumo da carteira atual',y)
let linhas=CALC_PDF.carteira.map(a=>[
textoPDF(a.empresa),
textoPDF(a.codigo),
numeroPDF(a.qtd,2),
moedaPDF(a.custo),
moedaPDF(a.pm),
moedaPDF(a.realizado),
textoPDF(a.operacoes)
])
tabelaPDF(
doc,
[
'Empresa',
'Código',
'Qtd. atual',
'Custo atual',
'Preço médio',
'Lucro/Prejuízo',
'Operações'
],
linhas,
y,
{
columnStyles:{
0:{cellWidth:52},
1:{cellWidth:24},
2:{halign:'right',cellWidth:25},
3:{halign:'right',cellWidth:38},
4:{halign:'right',cellWidth:34},
5:{halign:'right',cellWidth:40},
6:{halign:'right',cellWidth:24}
}
}
)
}
}
/*=========================================================
043 PDF - CARTEIRA
=========================================================*/
if(selecionados.carteira){
let y=prepararSecao('Carteira')
y=tituloSecaoPDF(doc,'Carteira por empresa / ativo',y)
let linhas=CALC_PDF.carteira.map(a=>[
textoPDF(a.empresa),
textoPDF(a.codigo),
numeroPDF(a.qtd,2),
moedaPDF(a.custo),
moedaPDF(a.pm),
moedaPDF(a.realizado),
textoPDF(a.operacoes)
])
tabelaPDF(
doc,
[
'Empresa',
'Código',
'Qtd. atual',
'Custo atual',
'Preço médio',
'Lucro/Prejuízo realizado',
'Operações'
],
linhas,
y,
{
columnStyles:{
0:{cellWidth:52},
1:{cellWidth:24},
2:{halign:'right',cellWidth:25},
3:{halign:'right',cellWidth:38},
4:{halign:'right',cellWidth:34},
5:{halign:'right',cellWidth:44},
6:{halign:'right',cellWidth:24}
},
didParseCell:function(data){
if(data.section==='body'&&data.column.index===5){
let linha=CALC_PDF.carteira[data.row.index]
if(linha){
if(Number(linha.realizado)>=0){
data.cell.styles.textColor=[21,128,61]
}else{
data.cell.styles.textColor=[220,38,38]
}
data.cell.styles.fontStyle='bold'
}
}
}
}
)
}
/*=========================================================
044 PDF - OPERAÇÕES
=========================================================*/
if(selecionados.operacoes){
let y=prepararSecao('Operações')
y=tituloSecaoPDF(doc,'Histórico de compras e vendas',y)
let dados=[...OPERACOES_PDF].sort((a,b)=>{
let dataA=String(a.data||'')
let dataB=String(b.data||'')
if(dataA!==dataB)return dataB.localeCompare(dataA)
return Number(b.id||0)-Number(a.id||0)
})
let linhas=dados.map(o=>{
let valor=Number(o.valor_bruto)||(
(Number(o.quantidade)||0)*
(Number(o.preco_unitario)||0)
)
return[
dataBR(o.data),
textoPDF(o.empresa),
textoPDF(o.codigo),
textoPDF(o.tipo),
numeroPDF(o.quantidade,2),
moedaPDF(o.preco_unitario),
moedaPDF(valor)
]
})
tabelaPDF(
doc,
[
'Data',
'Empresa',
'Código',
'Tipo',
'Quantidade',
'Preço unitário',
'Valor bruto'
],
linhas,
y,
{
columnStyles:{
0:{cellWidth:27},
1:{cellWidth:60},
2:{cellWidth:28},
3:{cellWidth:25},
4:{halign:'right',cellWidth:30},
5:{halign:'right',cellWidth:38},
6:{halign:'right',cellWidth:42}
},
didParseCell:function(data){
if(data.section==='body'&&data.column.index===3){
let tipo=String(data.cell.raw||'')
if(tipo==='Compra'){
data.cell.styles.textColor=[22,101,52]
data.cell.styles.fontStyle='bold'
}
if(tipo==='Venda'){
data.cell.styles.textColor=[153,27,27]
data.cell.styles.fontStyle='bold'
}
}
}
}
)
}
/*=========================================================
045 PDF - RESULTADOS
=========================================================*/
if(selecionados.resultados){
let y=prepararSecao('Resultados')
y=tituloSecaoPDF(doc,'Resultado mensal',y)
let dados=[...CALC_PDF.mensal].reverse()
let linhas=dados.map(x=>[
mesBR(x.mes+'-01'),
moedaPDF(x.compras),
moedaPDF(x.vendas),
moedaPDF(x.lucro),
moedaPDF(x.taxas),
moedaPDF(x.lucro-x.taxas)
])
tabelaPDF(
doc,
[
'Mês',
'Compras',
'Vendas',
'Resultado bruto',
'Taxas',
'Resultado após taxas'
],
linhas,
y,
{
columnStyles:{
0:{cellWidth:35},
1:{halign:'right',cellWidth:43},
2:{halign:'right',cellWidth:43},
3:{halign:'right',cellWidth:48},
4:{halign:'right',cellWidth:38},
5:{halign:'right',cellWidth:50}
},
didParseCell:function(data){
if(data.section!=='body')return
let linha=dados[data.row.index]
if(!linha)return
if(data.column.index===3){
data.cell.styles.fontStyle='bold'
data.cell.styles.textColor=
Number(linha.lucro)>=0
?[21,128,61]
:[220,38,38]
}
if(data.column.index===5){
let resultado=
Number(linha.lucro)-
Number(linha.taxas)
data.cell.styles.fontStyle='bold'
data.cell.styles.textColor=
resultado>=0
?[21,128,61]
:[220,38,38]
}
}
}
)
}
/*=========================================================
046 PDF - TAXAS
=========================================================*/
if(selecionados.taxas){
let y=prepararSecao('Taxas')
y=tituloSecaoPDF(doc,'Taxas operacionais',y)
let dados=[...TAXAS]
.filter(t=>registroNoPeriodoPDF(t.data,filtrosPDF))
.filter(t=>{
let liquidacao=Number(t.taxa_liquidacao)||0
let negociacao=Number(t.taxa_negociacao)||0
return liquidacao!==0||negociacao!==0
})
.sort((a,b)=>{
let dataA=String(a.data||'')
let dataB=String(b.data||'')
if(dataA!==dataB)return dataB.localeCompare(dataA)
return Number(b.id||0)-Number(a.id||0)
})
let linhas=dados.map(t=>{
let liquidacao=Number(t.taxa_liquidacao)||0
let negociacao=Number(t.taxa_negociacao)||0
return[
dataBR(t.data),
moedaPDF(liquidacao),
moedaPDF(negociacao),
moedaPDF(liquidacao+negociacao)
]
})
tabelaPDF(
doc,
[
'Data',
'Liquidação',
'Negociação',
'Total'
],
linhas,
y,
{
columnStyles:{
0:{cellWidth:50},
1:{halign:'right',cellWidth:60},
2:{halign:'right',cellWidth:60},
3:{halign:'right',cellWidth:60,fontStyle:'bold'}
}
}
)
let totalLiquidacao=dados.reduce(
(s,t)=>s+(Number(t.taxa_liquidacao)||0),
0
)
let totalNegociacao=dados.reduce(
(s,t)=>s+(Number(t.taxa_negociacao)||0),
0
)
let finalY=doc.lastAutoTable.finalY+8
let alturaPagina=doc.internal.pageSize.getHeight()
if(finalY>alturaPagina-35){
finalY=novaPaginaPDF(doc,'Taxas')
}
doc.setFillColor(248,250,252)
doc.setDrawColor(226,232,240)
doc.roundedRect(14,finalY,120,23,2,2,'FD')
doc.setFont('helvetica','bold')
doc.setFontSize(8)
doc.setTextColor(100,116,139)
doc.text('TOTAL TAXAS OPERACIONAIS',19,finalY+7)
doc.setFontSize(13)
doc.setTextColor(15,23,42)
doc.text(
moedaPDF(totalLiquidacao+totalNegociacao),
19,
finalY+17
)
}
/*=========================================================
047 PDF - IRRF
=========================================================*/
if(selecionados.irrf){
let y=prepararSecao('IRRF')
y=tituloSecaoPDF(doc,'IRRF registrado',y)
let dados=[...TAXAS]
.filter(t=>registroNoPeriodoPDF(t.data,filtrosPDF))
.filter(t=>(Number(t.irrf)||0)!==0)
.sort((a,b)=>{
let dataA=String(a.data||'')
let dataB=String(b.data||'')
if(dataA!==dataB)return dataB.localeCompare(dataA)
return Number(b.id||0)-Number(a.id||0)
})
let linhas=dados.map(t=>[
dataBR(t.data),
moedaPDF(Number(t.irrf)||0)
])
tabelaPDF(
doc,
[
'Data',
'IRRF'
],
linhas,
y,
{
columnStyles:{
0:{cellWidth:80},
1:{halign:'right',cellWidth:90,fontStyle:'bold'}
}
}
)
let totalIRRF=dados.reduce(
(s,t)=>s+(Number(t.irrf)||0),
0
)
let finalY=doc.lastAutoTable.finalY+8
let alturaPagina=doc.internal.pageSize.getHeight()
if(finalY>alturaPagina-35){
finalY=novaPaginaPDF(doc,'IRRF')
}
doc.setFillColor(248,250,252)
doc.setDrawColor(226,232,240)
doc.roundedRect(14,finalY,100,23,2,2,'FD')
doc.setFont('helvetica','bold')
doc.setFontSize(8)
doc.setTextColor(100,116,139)
doc.text('TOTAL IRRF',19,finalY+7)
doc.setFontSize(13)
doc.setTextColor(15,23,42)
doc.text(
moedaPDF(totalIRRF),
19,
finalY+17
)
}
/*=========================================================
048 FINALIZAR PDF
=========================================================*/
aplicarRodapesPDF(doc)
let agora=new Date()
let nomeArquivo=
'acoes-nemesio-'+
agora.getFullYear()+
String(agora.getMonth()+1).padStart(2,'0')+
String(agora.getDate()).padStart(2,'0')+
'-'+
String(agora.getHours()).padStart(2,'0')+
String(agora.getMinutes()).padStart(2,'0')+
'.pdf'
doc.save(nomeArquivo)
avisar('PDF gerado com sucesso')
}catch(erro){
console.error('Erro ao gerar PDF:',erro)
alert(
'Não foi possível gerar o PDF.\n\n'+
(erro?.message||erro)
)
avisar('Erro ao gerar PDF')
}
}
/*=========================================================
049 MARCAR TODOS OS PAINÉIS DO PDF
=========================================================*/
function marcarTodosPDF(){
[
'pdfResumo',
'pdfCarteira',
'pdfOperacoes',
'pdfResultados',
'pdfTaxas',
'pdfIRRF'
].forEach(id=>{
let campo=document.getElementById(id)
if(campo)campo.checked=true
})
}
/*=========================================================
050 DESMARCAR TODOS OS PAINÉIS DO PDF
=========================================================*/
function desmarcarTodosPDF(){
[
'pdfResumo',
'pdfCarteira',
'pdfOperacoes',
'pdfResultados',
'pdfTaxas',
'pdfIRRF'
].forEach(id=>{
let campo=document.getElementById(id)
if(campo)campo.checked=false
})
}
/*=========================================================
051 VERIFICAR BIBLIOTECAS
=========================================================*/
function verificarBibliotecas(){
if(typeof supabase==='undefined'){
console.error('Supabase JS não foi carregado.')
avisar('Erro • Supabase indisponível')
return false
}
if(typeof Chart==='undefined'){
console.warn('Chart.js não foi carregado.')
}
if(typeof window.jspdf==='undefined'){
console.warn('jsPDF não foi carregado.')
}
return true
}
/*=========================================================
052 AJUSTAR DATAS INICIAIS
=========================================================*/
function ajustarDatasIniciais(){
let campos=[
'opData',
'txData',
'irrfData'
]
campos.forEach(id=>{
let campo=document.getElementById(id)
if(campo&&!campo.value){
campo.value=hoje()
}
})
}
/*=========================================================
053 PREPARAR EVENTOS DA INTERFACE
=========================================================*/
function prepararEventos(){
let empresa=document.getElementById('opEmpresa')
let codigo=document.getElementById('opCodigo')
let busca=document.getElementById('buscaOp')
let tipo=document.getElementById('tipoOp')
if(empresa&&!empresa.dataset.listenerAtivo){
empresa.addEventListener('change',selecionarEmpresa)
empresa.dataset.listenerAtivo='1'
}
if(codigo&&!codigo.dataset.listenerAtivo){
codigo.addEventListener('change',selecionarCodigo)
codigo.dataset.listenerAtivo='1'
}
if(busca&&!busca.dataset.listenerAtivo){
busca.addEventListener('input',renderOperacoes)
busca.dataset.listenerAtivo='1'
}
if(tipo&&!tipo.dataset.listenerAtivo){
tipo.addEventListener('change',renderOperacoes)
tipo.dataset.listenerAtivo='1'
}
}
/*=========================================================
054 CORRIGIR ALTURA DOS GRÁFICOS
=========================================================*/
function redimensionarGraficos(){
if(CHART1){
try{
CHART1.resize()
}catch(erro){
console.warn('Erro ao redimensionar gráfico de resultados:',erro)
}
}
if(CHART2){
try{
CHART2.resize()
}catch(erro){
console.warn('Erro ao redimensionar gráfico da carteira:',erro)
}
}
}
/*=========================================================
055 OBSERVAR TROCA DE ABAS
=========================================================*/
function observarAbas(){
document.querySelectorAll('.nav button').forEach(botao=>{
if(botao.dataset.listenerResize==='1')return
botao.addEventListener('click',()=>{
setTimeout(redimensionarGraficos,100)
})
botao.dataset.listenerResize='1'
})
}
/*=========================================================
056 INICIALIZAÇÃO
=========================================================*/
async function inicializar(){
if(!verificarBibliotecas())return
ajustarDatasIniciais()
prepararEventos()
observarAbas()
atualizarVisibilidadeValores()
await carregar()
}
/*=========================================================
057 INICIAR SISTEMA
=========================================================*/
if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',inicializar)
}else{
inicializar()
}
