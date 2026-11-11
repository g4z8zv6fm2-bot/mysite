/* Legendary Cleaners business assistant tools.
   Safe add-on: uses the existing workspace data and save flow; does not change auth or push delivery. */
(function(){
'use strict';
const toolTabs=[
 ['routes','⌖','Route Optimization'],
 ['documents','▤','Document Center'],
 ['activity','◷','Activity Log & Cloud Status'],
 ['portal','♙','Customer Portal']
];
const esc=s=>typeof escapeHtml==='function'?escapeHtml(s):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=x=>Array.isArray(x)?x:[];
const money=n=>typeof fmtMoney==='function'?fmtMoney(n):'$'+(Number(n)||0).toFixed(2);
const today=()=>typeof isoToday==='function'?isoToday():new Date().toISOString().slice(0,10);
function ensure(){if(!db.assistantTools)db.assistantTools={suggestions:[],activity:[],documents:[],messages:[],properties:[],pricing:{oneStory:0,twoStory:0}};for(const k of ['suggestions','activity','documents','messages','properties','portalLinks'])if(!Array.isArray(db.assistantTools[k]))db.assistantTools[k]=[];if(!db.assistantTools.pricing||typeof db.assistantTools.pricing!=='object')db.assistantTools.pricing={oneStory:0,twoStory:0};if(!Number.isFinite(Number(db.assistantTools.pricing.oneStory)))db.assistantTools.pricing.oneStory=0;if(!Number.isFinite(Number(db.assistantTools.pricing.twoStory)))db.assistantTools.pricing.twoStory=0}
function log(action,detail,status='Recorded'){ensure();db.assistantTools.activity.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:currentUser?.email||currentUser?.user_metadata?.full_name||'Current user',action,detail,status});db.assistantTools.activity=db.assistantTools.activity.slice(0,250)}
function card(title,body,extra=''){return '<section class="card lc-tool-card"><h3>'+title+'</h3>'+body+extra+'</section>'}
function pageHead(title,subtitle){return '<div class="topline"><div><h2>'+title+'</h2><p class="muted">'+subtitle+'</p></div></div>'}
function renderRoutes(app){
 const jobs=arr(db.jobs).filter(j=>j.status!=='Completed'&&j.date>=today()).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
 const byDate={};jobs.forEach(j=>(byDate[j.date]||(byDate[j.date]=[])).push(j));
 const dates=Object.keys(byDate).sort();
 app.innerHTML=pageHead('Route Optimization','Group jobs with similar addresses and open a multi-stop driving route. Confirm locations before driving.')+
 card('Upcoming routes',!jobs.length?'<p class="muted">No upcoming incomplete jobs found.</p>':dates.map(date=>{const group=byDate[date];const groups={};group.forEach(j=>{const key=String(j.address||'').trim().toLowerCase().replace(/\s+/g,' ');(groups[key]||(groups[key]=[])).push(j)});return '<div class="lc-route-date"><h3>'+esc(date)+'</h3>'+Object.values(groups).map(g=>'<div class="lc-route-group"><b>'+esc(g.length===1?g[0].name:g.length+' jobs at similar address')+'</b><ul>'+g.map(j=>'<li>'+esc(j.time||'Time not set')+' · '+esc(j.name)+' · '+esc(j.address)+' · '+esc(j.assignee||'Owner')+'</li>').join('')+'</ul>'+((g.length&&g.every(j=>j.address))?'<a class="button secondary small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(g[g.length-1].address)+'&waypoints='+encodeURIComponent(g.slice(0,-1).map(j=>j.address).join('|'))+'">Open driving route</a>':'<span class="muted">Add addresses to create a route.</span>')+'</div>').join('')}).join(''))+
 '<div class="notice">This first version groups matching addresses and creates Google Maps routes. It does not claim to calculate live traffic, exact travel times, or the mathematically shortest route.</div>';
}

 function renderDocuments(app){
 ensure();
 app.innerHTML=pageHead('Document Center','Keep a searchable index of customer files and related jobs. Secure file storage must be configured before files can be uploaded.')+
 card('Add a document','<form id="lcDocForm"><label>Document title</label><input name="title" required maxlength="120" placeholder="Estimate, signed contract, job photos…"><label>Customer</label><select name="customerId"><option value="">General / not linked</option>'+arr(db.customers).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select><label>Document type</label><select name="type"><option>Signed contract</option><option>Estimate</option><option>Job photos</option><option>Customer document</option><option>Invoice</option><option>Other</option></select><label>File attachment</label><input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" required><button type="submit">Upload document</button></form><p class="muted">Uploads use the private Supabase Storage bucket <code>crm-documents</code>. If it has not been configured, the app will report the setup error rather than pretending the file was saved.</p>')+
 card('Saved documents','<div id="lcDocList">'+documentsHtml()+'</div>');
 const form=document.getElementById('lcDocForm');form.onsubmit=async e=>{e.preventDefault();if(!supabaseClient||!companyId){alert('Sign in to the connected company workspace before uploading documents.');return;}const fd=new FormData(form),file=fd.get('file'),title=String(fd.get('title')||'').trim(),customerId=String(fd.get('customerId')||''),type=String(fd.get('type')||'Other');if(!(file instanceof File)||!file.size){alert('Choose a file first.');return;}if(file.size>15*1024*1024){alert('Please choose a file smaller than 15 MB.');return;}const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=companyId+'/'+crypto.randomUUID()+'-'+safeName;const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Uploading…';try{const up=await supabaseClient.storage.from('crm-documents').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(up.error)throw up.error;ensure();db.assistantTools.documents.unshift({id:crypto.randomUUID(),title,type,customerId,path,fileName:file.name,size:file.size,createdAt:new Date().toISOString(),createdBy:currentUser?.email||'Current user'});log('Uploaded document',title+' ('+file.name+')');save();render();}catch(err){alert('Upload failed. The file was not added to the document list. Check that the private crm-documents bucket and its company access policies are configured. Details: '+(err.message||'Unknown storage error'));btn.disabled=false;btn.textContent='Upload document';}};
}
function documentsHtml(){ensure();if(!db.assistantTools.documents.length)return '<p class="muted">No documents indexed yet.</p>';return db.assistantTools.documents.map(d=>{const c=arr(db.customers).find(x=>x.id===d.customerId);return '<div class="lc-doc-row"><div><b>'+esc(d.title)+'</b><div class="muted">'+esc(d.type)+' · '+esc(c?.name||'General')+' · '+esc(d.fileName||'File')+'</div><small class="muted">'+esc(new Date(d.createdAt).toLocaleString())+'</small></div><button class="small secondary" onclick="lcOpenDocument(\''+d.id+'\')">Open</button></div>'}).join('')}
window.lcOpenDocument=async function(id){ensure();const d=db.assistantTools.documents.find(x=>x.id===id);if(!d||!supabaseClient)return;const r=await supabaseClient.storage.from('crm-documents').createSignedUrl(d.path,60);if(r.error){alert('Could not open this document: '+r.error.message);return;}window.open(r.data.signedUrl,'_blank','noopener')};
async function renderActivity(app){
 ensure();
 const status=document.getElementById('syncStatus')?.textContent||'Status unavailable';
 app.innerHTML=pageHead('Activity Log & Cloud Status','Recent server-recorded workspace changes and app-side activity.')+
 '<div class="grid"><div class="card metric"><small>Cloud status</small><strong>'+esc(status)+'</strong><span>Current app indicator</span></div><div class="card metric"><small>Local activity entries</small><strong>'+db.assistantTools.activity.length+'</strong><span>Recorded by this browser session</span></div></div>'+
 card('Server audit trail','<div id="lcServerAudit"><p class="muted">Loading company audit history…</p></div>')+
 card('Local activity',db.assistantTools.activity.length?db.assistantTools.activity.slice(0,100).map(a=>'<div class="lc-activity-row"><div><b>'+esc(a.action)+'</b><div class="muted">'+esc(a.detail)+'</div><small class="muted">'+esc(a.actor)+' · '+esc(new Date(a.at).toLocaleString())+'</small></div><span class="lc-status">'+esc(a.status)+'</span></div>').join(''):'<p class="muted">No local activity recorded yet.</p>')+
 '<div class="notice">The server audit trail records the changed workspace sections and timestamp without copying customer or job contents. It is more reliable than browser-only history, but it is not a compliance-certified immutable audit system.</div>';
 const holder=document.getElementById('lcServerAudit');
 if(!holder)return;
 if(!supabaseClient){holder.innerHTML='<p class="muted">Sign in to view the company audit trail.</p>';return;}
 try{
   const result=await supabaseClient.from('crm_workspace_audit').select('id,operation,changed_sections,user_id,created_at').order('created_at',{ascending:false}).limit(50);
   if(!document.getElementById('lcServerAudit'))return;
   if(result.error)throw result.error;
   const rows=arr(result.data);
   holder.innerHTML=rows.length?rows.map(row=>{
     const sections=arr(row.changed_sections).map(key=>({jobs:'Jobs',customers:'Customers',team:'Team'}[key]||String(key).replace(/_/g,' '))).join(', ');
     const actor=row.user_id?(row.user_id===currentUser?.id?'You':'Company member'):'System';
     return '<div class="lc-activity-row"><div><b>'+esc(row.operation==='INSERT'?'Created workspace':'Updated workspace')+'</b><div class="muted">Changed: '+esc(sections||'Workspace data')+'</div><small class="muted">'+esc(actor)+' · '+esc(new Date(row.created_at).toLocaleString())+'</small></div><span class="lc-status">Server</span></div>';
   }).join(''):'<p class="muted">No server-recorded workspace changes yet. New changes will appear here.</p>';
 }catch(error){
   holder.innerHTML='<p class="muted">Could not load the server audit trail: '+esc(error.message||'Unknown error')+'</p>';
 }
}
function renderPortal(app){
 ensure();
 const links=arr(db.assistantTools.portalLinks);
 const linksHtml=()=>links.length?links.map(link=>'<div class="lc-doc-row"><div><b>'+esc(link.customerName||'Customer')+'</b><div class="muted">Expires '+esc(new Date(link.expiresAt).toLocaleDateString())+'</div></div><button class="small danger" type="button" data-revoke-portal="'+esc(link.id)+'">Revoke link</button></div>').join(''):'<p class="muted">No customer portal links have been created yet.</p>';
 app.innerHTML=pageHead('Customer Portal','Create a private, expiring link for one customer. Customers only see their own appointments and contracts.')+
 card('Create customer access','<form id="lcPortalForm"><label>Customer</label><select name="customerId" required><option value="">Choose a customer…</option>'+arr(db.customers).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+' · '+esc(c.address||'No address')+'</option>').join('')+'</select><button type="submit">Create 30-day customer link</button></form><div id="lcPortalResult" class="notice" style="display:none;margin-top:12px"></div><p class="muted">Links are random, expire after 30 days, and can be revoked. The link is shown only once when created; do not paste it into public places.</p>')+
 card('Active links','<div id="lcPortalLinks">'+linksHtml()+'</div>')+
 card('What customers can see','<ul><li>Their own upcoming and past appointments</li><li>Contracts associated with their customer record or email</li><li>Contract terms and signing status</li></ul><p class="muted">Invoices and estimates are not in the current CRM data model, so they are not shown. This portal never exposes the shared company workspace, employee directory, or other customers.</p>');
 const form=document.getElementById('lcPortalForm');
 form.onsubmit=async e=>{
   e.preventDefault();
   if(!supabaseClient){alert('Sign in as the company owner to create a customer link.');return;}
   const customerId=String(new FormData(form).get('customerId')||'');
   const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Creating secure link…';
   try{
     const result=await supabaseClient.functions.invoke('customer-portal',{body:{action:'create',customerId}});
     if(result.error)throw result.error;
     if(result.data?.error)throw new Error(result.data.error);
     links.unshift({id:result.data.id,customerId:result.data.customerId,customerName:result.data.customerName,expiresAt:result.data.expiresAt});
     db.assistantTools.portalLinks=links;save();
     document.getElementById('lcPortalLinks').innerHTML=linksHtml();
     bindRevokeButtons();
     const box=document.getElementById('lcPortalResult');box.style.display='block';
     box.innerHTML='<b>Customer link created for '+esc(result.data.customerName)+'.</b><p>Copy this private link and send it directly to the customer:</p><input id="lcPortalUrl" readonly value="'+esc(result.data.url)+'" style="width:100%;box-sizing:border-box;margin:6px 0 10px"><button type="button" id="lcCopyPortalUrl">Copy customer link</button>';
     document.getElementById('lcCopyPortalUrl').onclick=async()=>{const input=document.getElementById('lcPortalUrl');input.select();try{await navigator.clipboard.writeText(input.value);document.getElementById('lcCopyPortalUrl').textContent='Copied';}catch(_){alert('Select the link above and copy it manually.')}};
     form.reset();
   }catch(err){alert('Could not create customer link. Make sure you are signed in as Owner and the customer portal deployment is complete. '+(err.message||''))}
   finally{btn.disabled=false;btn.textContent='Create 30-day customer link'}
 };
 function bindRevokeButtons(){
   document.querySelectorAll('[data-revoke-portal]').forEach(button=>button.onclick=async()=>{
     const id=button.dataset.revokePortal;if(!confirm('Revoke this customer link? The customer will no longer be able to open it.'))return;
     button.disabled=true;
     try{
       const result=await supabaseClient.functions.invoke('customer-portal',{body:{action:'revoke',linkId:id}});
       if(result.error)throw result.error;if(result.data?.error)throw new Error(result.data.error);
       const next=links.filter(x=>x.id!==id);db.assistantTools.portalLinks=next;save();renderPortal(app);
     }catch(err){button.disabled=false;alert('Could not revoke link: '+(err.message||'Unknown error'))}
   });
 }
 bindRevokeButtons();
}
const featureRender={routes:renderRoutes,documents:renderDocuments,activity:renderActivity,portal:renderPortal};
const oldRender=window.render,oldSetTab=window.setTab,oldSave=window.save,oldCustomerForm=window.customerForm;
if(typeof oldRender!=='function'||typeof oldSetTab!=='function')return;
if(typeof oldCustomerForm==='function'){window.customerForm=function(existing={}){oldCustomerForm(existing);const form=document.getElementById('customerForm');if(form&&!form.querySelector('[name="email"]')){const label=document.createElement('label');label.textContent='Email address';const input=document.createElement('input');input.name='email';input.type='email';input.autocomplete='email';input.placeholder='customer@example.com';input.value=existing.email||'';const submit=form.querySelector('button[type="submit"]');form.insertBefore(label,submit);form.insertBefore(input,submit);}}}
function injectNav(){const drawer=document.getElementById('dashboardDrawer');if(!drawer||drawer.querySelector('[data-lc-tools]'))return;const label=document.createElement('div');label.className='drawer-label';label.textContent='Business tools';label.setAttribute('data-lc-tools','label');drawer.appendChild(label);toolTabs.forEach(([id,ico,name])=>{const b=document.createElement('button');b.className='drawer-link';b.dataset.lcFeature=id;b.innerHTML='<span class="ico">'+ico+'</span>'+name;b.addEventListener('click',()=>{search='';window.setTab(id);document.querySelectorAll('[data-drawer-tab]').forEach(x=>x.classList.remove('active'));document.querySelectorAll('[data-lc-feature]').forEach(x=>x.classList.toggle('active',x.dataset.lcFeature===id));toggleDashboardMenu(false)});drawer.appendChild(b)})}
window.render=function(){if(auditSnapshot===null){try{auditSnapshot=auditState()}catch(_){}}if(featureRender[tab]){const app=document.getElementById('app');if(app)featureRender[tab](app);return;}return oldRender()};
window.setTab=function(t){if(featureRender[t]){tab=t;window.scrollTo(0,0);document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));const welcome=document.getElementById('welcome');if(welcome)welcome.textContent=({routes:'Plan employee driving routes.',documents:'Customer files and job documents.',activity:'Changes, cloud status, and delivery outcomes.',portal:'Secure customer self-service.'})[t]||'Business tools';injectNav();window.render();return;}document.querySelectorAll('[data-lc-feature]').forEach(x=>x.classList.remove('active'));return oldSetTab(t)};
let auditSnapshot=null;
function auditState(){return JSON.stringify({jobs:arr(db.jobs),customers:arr(db.customers),team:arr(db.team)})}
function recordDiff(before,after){try{const a=JSON.parse(before||'{}'),b=JSON.parse(after||'{}');for(const kind of ['jobs','customers','team']){const oldRows=arr(a[kind]),newRows=arr(b[kind]),label=kind==='jobs'?'job':kind==='customers'?'customer':'team member',key=x=>String(x.id||x.email||x.name||''),oldMap=new Map(oldRows.map(x=>[key(x),x])),newMap=new Map(newRows.map(x=>[key(x),x]));for(const [id,x] of newMap){if(!oldMap.has(id))log('Created '+label,x.name||x.fullName||id);else if(JSON.stringify(oldMap.get(id))!==JSON.stringify(x))log('Updated '+label,x.name||id)}for(const [id,x] of oldMap)if(!newMap.has(id))log('Removed '+label,x.name||id)}}catch(_){}}
if(typeof oldSave==='function'){window.save=function(){try{ensure();const before=auditSnapshot;const result=oldSave.apply(this,arguments);const after=auditState();if(before!==null&&before!==after)recordDiff(before,after);auditSnapshot=after;return result}catch(e){console.error('Save failed',e);throw e}}}
const style=document.createElement('style');style.textContent='.lc-property-pin-wrap{background:transparent;border:0}.lc-property-pin{box-sizing:border-box;min-width:112px;max-width:150px;padding:5px 7px;border:1px solid #1d4ed8;border-radius:8px;background:#fff;color:#172235;box-shadow:0 2px 8px #17223530;font:12px/1.25 system-ui,sans-serif;text-align:center;white-space:normal}.lc-property-pin b,.lc-property-pin span{display:block;overflow-wrap:anywhere}.lc-property-pin span{margin-top:2px;font-weight:700;color:#1d4ed8}.lc-property-row{margin:8px 0}.lc-property-row .grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lc-property-row .actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.lc-property-row .actions button{flex:1}.lc-property-row select,.lc-property-row input{box-sizing:border-box;width:100%;margin:5px 0 12px}.lc-property-row b{overflow-wrap:anywhere}.lc-tool-card{margin:12px 0}.lc-prompt-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.lc-answer{margin-top:14px;line-height:1.55}.lc-answer ul{padding-left:22px}.lc-answer li{margin:10px 0}.lc-suggestion,.lc-route-group{border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}.lc-doc-row,.lc-activity-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.lc-doc-row:last-child,.lc-activity-row:last-child{border-bottom:0}.lc-status{font-size:12px;padding:5px 8px;border-radius:8px;background:#eef2f7;white-space:nowrap}.lc-route-date{margin:14px 0}.lc-route-group ul{padding-left:20px}.lc-route-group li{margin:7px 0}.lc-tool-card textarea,.lc-tool-card input,.lc-tool-card select{box-sizing:border-box;width:100%;margin:5px 0 12px}.lc-tool-card textarea{resize:vertical}.lc-tool-card .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.lc-tool-card form>button{margin-top:4px}.dashboard-drawer .drawer-label[data-lc-tools]{margin-top:16px}@media(max-width:520px){.lc-doc-row,.lc-activity-row{align-items:flex-start}.lc-status{white-space:normal}.lc-prompt-row button{flex:1}}';document.head.appendChild(style);
ensure();injectNav();
const previousSync=window.syncWorkspaceNow;if(typeof previousSync==='function'){window.syncWorkspaceNow=async function(){const result=await previousSync.apply(this,arguments);try{log('Cloud workspace sync',document.getElementById('syncStatus')?.textContent||'Sync completed',document.getElementById('syncStatus')?.textContent||'Unknown');}catch(_){}return result}}
})();
