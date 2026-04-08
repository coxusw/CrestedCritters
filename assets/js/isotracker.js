const STORAGE = "isoTrackerData";

let data = JSON.parse(localStorage.getItem(STORAGE) || `{
"colonies": [],
"botanicals": [],
"prices": {},
"settings": {
"logo": ""
}
}`);

function save(){
localStorage.setItem(STORAGE, JSON.stringify(data));
}

function today(){
let d = new Date();
return `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;
}

function daysSince(date){
if(!date) return 999;
let [m,d,y] = date.split("/");
let dt = new Date(y,m-1,d);
return Math.floor((new Date()-dt)/(1000*60*60*24));
}

function status(days){
if(days<=3) return "green";
if(days<=10) return "yellow";
return "red";
}

function statusText(days){
if(days<=3) return "Checked Recently";
if(days<=10) return "Needs Attention Soon";
return "Needs Checked";
}

function render(){
document.getElementById("isoApp").innerHTML = `
<div class="iso-header">
<img src="/assets/images/crested-critters-logo.png">
<h1>IsoTracker</h1>
</div>

<div class="iso-tabs">
<div class="iso-tab active" onclick="renderColonies()">Colonies</div>
<div class="iso-tab" onclick="renderBotanicals()">Botanicals</div>
<div class="iso-tab" onclick="renderPrice()">Price Sheet</div>
<div class="iso-tab" onclick="renderGuide()">Guide</div>
</div>

<div id="isoContent"></div>
`;

renderColonies();
}

function renderColonies(){
let html = `<button class="iso-btn iso-btn-primary" onclick="addColony()">+ Add Colony</button>`;

data.colonies
.sort((a,b)=>daysSince(b.last)-daysSince(a.last))
.forEach((c,i)=>{
let d = daysSince(c.last);
let s = status(d);

html += `
<div class="iso-card ${s}">
<b>${c.name}</b> (${c.type})<br>
Pop: ${c.pop}<br>
Last Updated: ${c.last || "Never"}<br>
<span class="iso-badge ${s}-badge">${statusText(d)}</span><br>

<button class="iso-btn" onclick="quick(${i},'mist')">Mist</button>
<button class="iso-btn" onclick="quick(${i},'feed')">Feed</button>
<button class="iso-btn" onclick="quick(${i},'clean')">Substrate</button>
</div>`;
});

document.getElementById("isoContent").innerHTML = html;
}

function addColony(){
let name = prompt("Colony name?");
let type = prompt("Type?");
data.colonies.push({
name,
type,
pop:0,
last:""
});
save();
renderColonies();
}

function quick(i){
data.colonies[i].last = today();
save();
renderColonies();
}

function renderBotanicals(){
let html = `<button class="iso-btn iso-btn-primary" onclick="addBotanical()">+ Add Item</button>`;

data.botanicals.forEach((b,i)=>{
html += `
<div class="iso-card">
<b>${b.name}</b><br>
Qty: ${b.qty}<br>
Note: ${b.note}<br>
</div>`;
});

document.getElementById("isoContent").innerHTML = html;
}

function addBotanical(){
let name = prompt("Item?");
let qty = prompt("Qty?");
let note = prompt("Note?");
data.botanicals.push({name,qty,note});
save();
renderBotanicals();
}

function renderPrice(){
let html = `<button class="iso-btn iso-btn-primary" onclick="exportData()">Export Data</button>
<input type="file" onchange="importData(event)">`;

html += `<div class="iso-price-card">`;

html += `<h2>Isopods</h2>`;
data.colonies.forEach(c=>{
let price = data.prices[c.type] || "";
html += `${c.type} - ${price || "Not Available"}<br>`;
});

html += `<h2>Botanicals</h2>`;
data.botanicals.forEach(b=>{
let price = data.prices[b.name] || "";
html += `${b.name} - ${price || "Not Available"} (${b.note})<br>`;
});

html += `</div>`;

document.getElementById("isoContent").innerHTML = html;
}

function renderGuide(){
document.getElementById("isoContent").innerHTML = `
<h2>Guide</h2>
<p>Track colonies, update care, manage botanicals, and generate price sheets.</p>
`;
}

function exportData(){
let blob = new Blob([JSON.stringify(data)], {type:"application/json"});
let a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = "isotracker-backup.json";
a.click();
}

function importData(e){
let file = e.target.files[0];
let reader = new FileReader();
reader.onload = ()=>{
data = JSON.parse(reader.result);
save();
render();
};
reader.readAsText(file);
}

render();
