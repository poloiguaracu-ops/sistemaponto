const express=require("express");
const path=require("path");
const fs=require("fs");
const Database=require("better-sqlite3");
const jwt=require("jsonwebtoken");

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||"TROQUE-ESTA-CHAVE-ANTES-DE-PUBLICAR";
const dataDir=path.join(__dirname,"data");
fs.mkdirSync(dataDir,{recursive:true});
const db=new Database(path.join(dataDir,"ponto.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS employees(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 cpf TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL DEFAULT 'employee',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS punches(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 employee_id INTEGER NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('entrada','intervalo','retorno','saida')),
 recorded_at TEXT NOT NULL,
 ip TEXT,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE TABLE IF NOT EXISTS justifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 employee_id INTEGER NOT NULL,
 date TEXT NOT NULL,
 category TEXT NOT NULL,
 description TEXT NOT NULL,
 document_name TEXT,
 document_data TEXT,
 status TEXT NOT NULL DEFAULT 'Pendente',
 created_at TEXT NOT NULL,
 reviewed_at TEXT,
 reviewer_id INTEGER,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS idx_punches_employee_date ON punches(employee_id,recorded_at);
CREATE INDEX IF NOT EXISTS idx_just_employee_date ON justifications(employee_id,date);
`);

function nowBrasilia(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`;
}
function cleanCPF(v){return String(v||"").replace(/\\D/g,"").slice(0,11)}
function validCPF(v){return /^\\d{11}$/.test(v)}
function firstEight(cpf){return cpf.slice(0,8)}

const adminCPF="00000000000";
if(!db.prepare("SELECT id FROM employees WHERE cpf=?").get(adminCPF)){
 db.prepare("INSERT INTO employees(name,cpf,role,created_at) VALUES(?,?,?,?)").run("Administrador do Polo",adminCPF,"admin",nowBrasilia());
}

app.use(express.json({limit:"8mb"}));
app.use(express.static(path.join(__dirname,"public")));

function auth(req,res,next){
 const token=(req.headers.authorization||"").replace("Bearer ","");
 try{req.user=jwt.verify(token,JWT_SECRET);next()}catch{res.status(401).json({error:"Sessão inválida ou expirada."})}
}
function adminOnly(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Acesso administrativo necessário."});next()}

app.post("/api/login",(req,res)=>{
 const cpf=cleanCPF(req.body?.cpf);
 const employee=db.prepare("SELECT id,name,cpf,role,active FROM employees WHERE cpf=?").get(cpf);
 if(!employee||!employee.active||!validCPF(cpf))return res.status(401).json({error:"CPF não cadastrado ou usuário inativo."});
 if(String(req.body?.password||"")!==firstEight(cpf))return res.status(401).json({error:"Senha incorreta. A senha inicial são os 8 primeiros dígitos do CPF."});
 const token=jwt.sign({id:employee.id,name:employee.name,cpf:employee.cpf,role:employee.role},JWT_SECRET,{expiresIn:"12h"});
 res.json({token,user:{id:employee.id,name:employee.name,cpf:employee.cpf,role:employee.role}});
});

app.get("/api/me",auth,(req,res)=>res.json(req.user));
app.get("/api/time",(req,res)=>res.json({now:nowBrasilia(),timeZone:"America/Sao_Paulo"}));

app.post("/api/punch",auth,(req,res)=>{
 if(req.user.role==="admin")return res.status(400).json({error:"Use um cadastro de funcionário para registrar frequência."});
 const now=nowBrasilia();
 const result=db.prepare("INSERT INTO punches(employee_id,type,recorded_at,ip) VALUES(?,?,?,?)").run(req.user.id,"registro",now,req.ip);
 res.json({id:result.lastInsertRowid,recorded_at:now,message:"O seu registro foi aprovado e registrado com sucesso."});
});

app.get("/api/my-punches",auth,(req,res)=>{
 const date=String(req.query.date||nowBrasilia().slice(0,10));
 res.json(db.prepare("SELECT id,type,recorded_at FROM punches WHERE employee_id=? AND date(recorded_at)=date(?) ORDER BY recorded_at").all(req.user.id,date));
});

app.get("/api/my-justifications",auth,(req,res)=>{
 res.json(db.prepare("SELECT id,date,category,description,document_name,status,created_at,reviewed_at FROM justifications WHERE employee_id=? ORDER BY created_at DESC").all(req.user.id));
});

app.post("/api/justifications",auth,(req,res)=>{
 const {date,category,description,documentName,documentData}=req.body||{};
 const categories=["Formadores","Atestados e declarações médicas (dia todo)","Atestados e declarações médicas (hora/período)","Aula cumprida fora da escola","Escola fechada por motivo de força maior","Justificativa de cunho administrativo","Justificativa de cunho pessoal","Sistema indisponível ou com falha","Trabalho externo"];
 if(!date||!categories.includes(category)||!description?.trim())return res.status(400).json({error:"Informe a data, o tipo e a descrição da justificativa."});
 if(documentData&&documentData.length>7000000)return res.status(400).json({error:"Documento muito grande. Envie um PDF menor."});
 const created=nowBrasilia();
 const r=db.prepare("INSERT INTO justifications(employee_id,date,category,description,document_name,document_data,status,created_at) VALUES(?,?,?,?,?,?,?,?)").run(req.user.id,date,category,description.trim(),documentName||null,documentData||null,"Pendente",created);
 res.json({id:r.lastInsertRowid,message:"Justificativa enviada para análise da chefia."});
});

app.get("/api/employees",auth,adminOnly,(req,res)=>res.json(db.prepare("SELECT id,name,cpf,role,active,created_at FROM employees ORDER BY name").all()));
app.post("/api/employees",auth,adminOnly,(req,res)=>{
 const name=String(req.body?.name||"").trim(),cpf=cleanCPF(req.body?.cpf);
 if(!name||!validCPF(cpf))return res.status(400).json({error:"Informe nome e um CPF com 11 dígitos."});
 try{const r=db.prepare("INSERT INTO employees(name,cpf,role,created_at) VALUES(?,?,?,?)").run(name,cpf,"employee",nowBrasilia());res.json({id:r.lastInsertRowid,password:firstEight(cpf)})}
 catch{res.status(400).json({error:"Esse CPF já está cadastrado."})}
});
app.patch("/api/employees/:id",auth,adminOnly,(req,res)=>{
 const e=db.prepare("SELECT * FROM employees WHERE id=?").get(req.params.id);
 if(!e)return res.status(404).json({error:"Funcionário não encontrado."});
 db.prepare("UPDATE employees SET name=?,active=? WHERE id=?").run(String(req.body?.name||e.name).trim(),req.body?.active===undefined?e.active:(req.body.active?1:0),e.id);
 res.json({ok:true});
});

app.get("/api/report",auth,adminOnly,(req,res)=>{
 const date=String(req.query.date||nowBrasilia().slice(0,10));
 const punches=db.prepare("SELECT p.id,e.name,e.cpf,p.recorded_at FROM punches p JOIN employees e ON e.id=p.employee_id WHERE date(p.recorded_at)=date(?) ORDER BY p.recorded_at").all(date);
 const justifications=db.prepare("SELECT j.id,e.name,e.cpf,j.date,j.category,j.description,j.document_name,j.status,j.created_at FROM justifications j JOIN employees e ON e.id=j.employee_id WHERE date(j.date)=date(?) ORDER BY j.created_at").all(date);
 res.json({punches,justifications});
});
app.get("/api/justifications",auth,adminOnly,(req,res)=>res.json(db.prepare("SELECT j.id,e.name,e.cpf,j.date,j.category,j.description,j.document_name,j.status,j.created_at,j.reviewed_at FROM justifications j JOIN employees e ON e.id=j.employee_id ORDER BY j.created_at DESC").all()));
app.patch("/api/justifications/:id",auth,adminOnly,(req,res)=>{
 const status=req.body?.status;
 if(!["Aprovado","Rejeitado"].includes(status))return res.status(400).json({error:"Status inválido."});
 db.prepare("UPDATE justifications SET status=?,reviewed_at=?,reviewer_id=? WHERE id=?").run(status,nowBrasilia(),req.user.id,req.params.id);
 res.json({ok:true});
});
app.get("/api/justifications/:id/document",auth,adminOnly,(req,res)=>{
 const j=db.prepare("SELECT document_name,document_data FROM justifications WHERE id=?").get(req.params.id);
 if(!j?.document_data)return res.status(404).json({error:"Documento não encontrado."});
 const m=j.document_data.match(/^data:([^;]+);base64,(.*)$/);
 if(!m)return res.status(400).json({error:"Documento inválido."});
 res.setHeader("Content-Type",m[1]);res.setHeader("Content-Disposition",`inline; filename="${j.document_name||"documento"}"`);res.send(Buffer.from(m[2],"base64"));
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log("Sistema de ponto rodando na porta "+PORT));
