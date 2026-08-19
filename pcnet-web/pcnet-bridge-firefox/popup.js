const statusEl=document.getElementById('status');
const detail=document.getElementById('detail');
const connect=document.getElementById('connect');
async function refresh(){
  const s=await browser.runtime.sendMessage({type:'NEXUS_COMMAND',action:'STATUS'});
  statusEl.className='status '+(s.conectado?'ok':'warn');
  statusEl.textContent=s.conectado?'● Conectado':'○ Não conectado';
  detail.textContent=s.conectado?'PCNet pronto para uso em segundo plano.':'Faça login no PCNet para conectar o Nexus.';
  connect.style.display=s.conectado?'none':'block';
}
connect.addEventListener('click',async()=>{
  await browser.runtime.sendMessage({type:'NEXUS_COMMAND',action:'OPEN_PCNET'});
  window.close();
});
refresh();
