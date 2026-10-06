const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "TROQUE-ESTA-CHAVE-ANTES-DE-PUBLICAR";
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "ponto.db"));
db.pragma("journal_mode = WAL");

db.exec("CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, registration TEXT NOT NULL UNIQUE, pin TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'employee', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE IF NOT EXISTS punches (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('entrada','intervalo_inicio','intervalo_fim','saida')), recorded_at TEXT NOT NULL, ip TEXT, FOREIGN KEY(employee_id) REFERENCES employees(id)); CREATE INDEX IF NOT EXISTS idx_punches_employee_date ON punches(employee_id, recorded_at);");

if (!db.prepare("SELECT id FROM employees WHERE registration = ?").get("ADMIN")) {
  db.prepare("INSERT INTO employees (name, registration, pin, role) VALUES (?, ?, ?, 'admin')").run("Administrador do Polo", "ADMIN", "1234");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req,res,next){
  const token=(req.headers.authorization||"").replace("Bearer ","");
  try { req.user=jwt.verify(token,JWT_SECRET); next(); }
  catch { res.status(401).json({error:"Sessão inválida ou expirada."}); }
}
function adminOnly(req,res,next){
  if(req.user.role!=="admin") return res.status(403).json({error:"Acesso administrativo necessário."});
  next();
}

app.post("/api/login",(req,res)=>{
  const {registration,pin}=req.body||{};
  const user=db.prepare("SELECT id,name,registration,role,active,pin FROM employees WHERE registration=?").get(String(registration||"").trim());
  if(!user||!user.active||user.pin!==String(pin||"")) return res.status(401).json({error:"Matrícula ou PIN incorreto."});
  const token=jwt.sign({id:user.id,name:user.name,registration:user.registration,role:user.role},JWT_SECRET,{expiresIn:"12h"});
  res.json({token,user:{id:user.id,name:user.name,registration:user.registration,role:user.role}});
});

app.get("/api/me",auth,(req,res)=>res.json(req.user));

app.post("/api/punch",auth,(req,res)=>{
  if(req.user.role==="admin") return res.status(400).json({error:"Use um cadastro de funcionário para registrar ponto."});
  const {type}=req.body||{};
  if(!["entrada","intervalo_inicio","intervalo_fim","saida"].includes(type)) return res.status(400).json({error:"Tipo de registro inválido."});
  const today=new Date().toISOString().slice(0,10);
  const rows=db.prepare("SELECT type FROM punches WHERE employee_id=? AND date(recorded_at)=date(?) ORDER BY recorded_at").all(req.user.id,today);
  const last=rows.at(-1)?.type;
  const allowed={entrada:!last,intervalo_inicio:last==="entrada",intervalo_fim:last==="intervalo_inicio",saida:last==="entrada"||last==="intervalo_fim"};
  if(!allowed[type]) return res.status(400).json({error:"Essa marcação não é permitida neste momento."});
  const now=new Date().toISOString();
  const result=db.prepare("INSERT INTO punches (employee_id,type,recorded_at,ip) VALUES (?,?,?,?)").run(req.user.id,type,now,req.ip);
  res.json({id:result.lastInsertRowid,type,recorded_at:now});
});

app.get("/api/my-punches",auth,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json(db.prepare("SELECT id,type,recorded_at FROM punches WHERE employee_id=? AND date(recorded_at)=date(?) ORDER BY recorded_at").all(req.user.id,date));
});

app.get("/api/employees",auth,adminOnly,(req,res)=>{
  res.json(db.prepare("SELECT id,name,registration,role,active,created_at FROM employees ORDER BY name").all());
});

app.post("/api/employees",auth,adminOnly,(req,res)=>{
  const {name,registration,pin}=req.body||{};
  if(!name||!registration||!pin) return res.status(400).json({error:"Nome, matrícula e PIN são obrigatórios."});
  try{
    const result=db.prepare("INSERT INTO employees (name,registration,pin) VALUES (?,?,?)").run(name.trim(),registration.trim(),String(pin));
    res.json({id:result.lastInsertRowid});
  }catch{res.status(400).json({error:"Essa matrícula já está cadastrada."});}
});

app.patch("/api/employees/:id",auth,adminOnly,(req,res)=>{
  const e=db.prepare("SELECT * FROM employees WHERE id=?").get(req.params.id);
  if(!e)return res.status(404).json({error:"Funcionário não encontrado."});
  const {name,pin,active}=req.body||{};
  db.prepare("UPDATE employees SET name=?,pin=?,active=? WHERE id=?").run(name?.trim()||e.name,pin!==undefined?String(pin):e.pin,active===undefined?e.active:(active?1:0),e.id);
  res.json({ok:true});
});

app.get("/api/report",auth,adminOnly,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json(db.prepare("SELECT p.id,e.name,e.registration,p.type,p.recorded_at FROM punches p JOIN employees e ON e.id=p.employee_id WHERE date(p.recorded_at)=date(?) ORDER BY p.recorded_at").all(date));
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log("Sistema de ponto rodando na porta "+PORT));
