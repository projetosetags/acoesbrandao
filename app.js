const SUPABASE_URL='https://zvtzbiqfwhggysiuiuxh.supabase.co'
const SUPABASE_KEY='sb_publishable_6rUNIHwItIcgG_HLyTfOxA_bKACJEQt'
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
let OPERACOES=[],TAXAS=[],CALC=null,CHART1=null,CHART2=null
const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const num=v=>(Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:2})
const dataBR=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'—'
const mesBR=s=>new Date(s+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})
function hoje(){return new Date().toISOString().slice(0,10)}
function avisar(t){document.getElementById('status').textContent=t}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{
document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('ativo'))
document.querySelectorAll('.aba').forEach(x=>x.classList.remove('ativa'))
b.classList.add('ativo')
document.getElementById(b.dataset.tab).classList.add('ativa')
})
function calcular(){
let ops=[...OPERACOES].sort((a,b)=>a.data.localeCompare(b.data)||a.id-b.id),ativos={},realizado=0,compras=0,vendas=0
for(const o of ops){
let a=ativos[o.codigo]||(ativos[o.codigo]={empresa:o.empresa,codigo:o.codigo,qtd:0,custo:0,realizado:0,operacoes:0})
let q=Number(o.quantidade),p=Number(o.preco_unitario),v=q*p
a.empresa=o.empresa
a.operacoes++
if(o.tipo==='Compra'){
a.custo+=v
a.qtd+=q
compras+=v
}else{
let pm=a.qtd>0?a.custo/a.qtd:0,cv=Math.min(q,a.qtd)*pm,l=v-cv
a.qtd-=q
a.custo-=cv
if(Math.abs(a.qtd)<.000001){
a.qtd=0
a.custo=0
}
a.realizado+=l
realizado+=l
vendas+=v
}
}
let carteira=Object.values(ativos).map(a=>({...a,pm:a.qtd?a.custo/a.qtd:0})).sort((a,b)=>b.custo-a.custo)
let mensal={}
for(const o of ops){
let m=o.data.slice(0,7),x=mensal[m]||(mensal[m]={mes:m,compras:0,vendas:0,lucro:0,taxas:0})
if(o.tipo==='Compra')x.compras+=Number(o.valor_bruto)
else x.vendas+=Number(o.valor_bruto)
}
let state={}
for(const o of ops){
let a=state[o.codigo]||(state[o.codigo]={q:0,c:0})
let q=Number(o.quantidade),v=q*Number(o.preco_unitario),m=o.data.slice(0,7)
if(o.tipo==='Compra'){
a.q+=q
a.c+=v
}else{
let pm=a.q?a.c/a.q:0,cv=Math.min(q,a.q)*pm
mensal[m].lucro+=v-cv
a.q-=q
a.c-=cv
if(a.q<=0){
a.q=0
a.c=0
}
}
}
let taxasTotal=0
for(const t of TAXAS){
let m=t.data.slice(0,7)
if(!mensal[m])mensal[m]={mes:m,compras:0,vendas:0,lucro:0,taxas:0}
mensal[m].taxas+=Number(t.taxas_operacionais)
taxasTotal+=Number(t.taxas_operacionais)
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
async function carregar(){
avisar('Atualizando…')
let [o,t]=await Promise.all([
db.from('nemesio_operacoes').select('*').order('data',{ascending:true}).order('id',{ascending:true}),
db.from('nemesio_taxas').select('*').order('data',{ascending:true})
])
if(o.error||t.error){
console.error(o.error||t.error)
avisar('Erro de conexão')
return
}
OPERACOES=o.data||[]
TAXAS=t.data||[]
CALC=calcular()
renderTudo()
avisar('Dados atualizados • '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))
}
function renderTudo(){
kInvestido.textContent=brl(CALC.investido)
kQtd.textContent=num(CALC.qtd)
kLucro.textContent=brl(CALC.realizado)
kLucro.className=CALC.realizado>=0?'pos':'neg'
kTaxas.textContent=brl(CALC.taxasTotal)
kCompras.textContent=brl(CALC.compras)
kVendas.textContent=brl(CALC.vendas)
renderCarteira()
renderOperacoes()
renderMensal()
renderTaxas()
renderGraficos()
}
function tabela(headers,rows){
return `<div class="tablewrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
}
function renderCarteira(){
let rows=CALC.carteira.map(a=>`<tr><td><b>${a.empresa}</b></td><td>${a.codigo}</td><td class="right">${num(a.qtd)}</td><td class="right">${brl(a.custo)}</td><td class="right">${brl(a.pm)}</td><td class="right ${a.realizado>=0?'pos':'neg'}">${brl(a.realizado)}</td><td class="right">${a.operacoes}</td></tr>`)
let html=tabela(['Empresa','Código','Qtd. atual','Custo atual','Preço médio','Lucro/Prejuízo realizado','Operações'],rows)
tabelaCarteira.innerHTML=html
resumoPainel.innerHTML=html
}
function renderOperacoes(){
let q=(buscaOp.value||'').toLowerCase(),tp=tipoOp.value
let dados=[...OPERACOES].filter(o=>(!q||(o.empresa+' '+o.codigo).toLowerCase().includes(q))&&(!tp||o.tipo===tp)).sort((a,b)=>b.data.localeCompare(a.data)||b.id-a.id)
let rows=dados.map(o=>`<tr><td>${dataBR(o.data)}</td><td>${o.empresa}</td><td><b>${o.codigo}</b></td><td><span class="tag ${o.tipo.toLowerCase()}">${o.tipo}</span></td><td class="right">${num(o.quantidade)}</td><td class="right">${brl(o.preco_unitario)}</td><td class="right">${brl(o.valor_bruto)}</td><td><button class="btn danger" onclick="excluirOperacao(${o.id})">Excluir</button></td></tr>`)
tabelaOperacoes.innerHTML=tabela(['Data','Empresa','Código','Tipo','Qtd.','Preço','Valor bruto',''],rows)
}
function renderMensal(){
let rows=[...CALC.mensal].reverse().map(x=>`<tr><td><b>${mesBR(x.mes+'-01')}</b></td><td class="right">${brl(x.compras)}</td><td class="right">${brl(x.vendas)}</td><td class="right ${x.lucro>=0?'pos':'neg'}">${brl(x.lucro)}</td><td class="right">${brl(x.taxas)}</td><td class="right ${x.lucro-x.taxas>=0?'pos':'neg'}">${brl(x.lucro-x.taxas)}</td></tr>`)
tabelaMensal.innerHTML=tabela(['Mês','Compras','Vendas','Resultado bruto','Taxas','Resultado após taxas'],rows)
}
function renderTaxas(){
let rows=[...TAXAS].reverse().map(t=>`<tr><td>${dataBR(t.data)}</td><td class="right">${brl(t.taxa_liquidacao)}</td><td class="right">${brl(t.taxa_negociacao)}</td><td class="right">${brl(t.irrf)}</td><td class="right"><b>${brl(t.taxas_operacionais)}</b></td><td><button class="btn danger" onclick="excluirTaxa(${t.id})">Excluir</button></td></tr>`)
tabelaTaxas.innerHTML=tabela(['Data','Liquidação','Negociação','IRRF','Total',''],rows)
}
function renderGraficos(){
let labels=CALC.mensal.map(x=>mesBR(x.mes+'-01')),lucros=CALC.mensal.map(x=>x.lucro-x.taxas)
if(CHART1)CHART1.destroy()
CHART1=new Chart(grafResultado,{
type:'bar',
data:{labels,datasets:[{label:'Resultado após taxas',data:lucros}]},
options:{
responsive:true,
maintainAspectRatio:false,
plugins:{legend:{display:false}},
scales:{y:{ticks:{callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')}}}
}
})
let ativos=CALC.carteira.filter(x=>x.custo>0)
if(CHART2)CHART2.destroy()
CHART2=new Chart(grafCarteira,{
type:'doughnut',
data:{labels:ativos.map(x=>x.codigo),datasets:[{data:ativos.map(x=>x.custo)}]},
options:{
responsive:true,
maintainAspectRatio:false,
plugins:{legend:{position:'right'}}
}
})
}
async function salvarOperacao(){
let obj={
data:opData.value,
empresa:opEmpresa.value.trim(),
codigo:opCodigo.value.trim().toUpperCase(),
tipo:opTipo.value,
quantidade:Number(opQtd.value),
preco_unitario:Number(opPreco.value)
}
if(!obj.data||!obj.empresa||!obj.codigo||obj.quantidade<=0||obj.preco_unitario<0)return alert('Preencha corretamente todos os campos.')
let r=await db.from('nemesio_operacoes').insert(obj)
if(r.error)return alert(r.error.message)
opEmpresa.value=opCodigo.value=opQtd.value=opPreco.value=''
await carregar()
}
async function excluirOperacao(id){
if(!confirm('Excluir esta operação?'))return
let r=await db.from('nemesio_operacoes').delete().eq('id',id)
if(r.error)return alert(r.error.message)
await carregar()
}
async function salvarTaxa(){
let obj={
data:txData.value,
taxa_liquidacao:Number(txLiq.value||0),
taxa_negociacao:Number(txNeg.value||0),
irrf:Number(txIrrf.value||0)
}
if(!obj.data)return alert('Informe a data.')
let r=await db.from('nemesio_taxas').upsert(obj,{onConflict:'data'})
if(r.error)return alert(r.error.message)
await carregar()
}
async function excluirTaxa(id){
if(!confirm('Excluir estas taxas?'))return
let r=await db.from('nemesio_taxas').delete().eq('id',id)
if(r.error)return alert(r.error.message)
await carregar()
}
opData.value=txData.value=hoje()
carregar()
