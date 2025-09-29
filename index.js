// index.js
const express = require('express');
const sqlite3 = require('sqlite3');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(bodyParser.json());


const DB = new sqlite3.Database('./db.sqlite');


// helper: run a statement as promise
function run(db, sql, params=[]) {
return new Promise((resolve, reject) => db.run(sql, params, function(err){
if (err) return reject(err);
resolve({ id: this.lastID });
}));
}
function all(db, sql, params=[]) {
return new Promise((resolve, reject) => db.all(sql, params, (err, rows)=>{
if (err) return reject(err);
resolve(rows);
}));
}
function get(db, sql, params=[]) {
return new Promise((resolve, reject) => db.get(sql, params, (err, row)=>{
if (err) return reject(err);
resolve(row);
}));
}


// init (create tables if not exists)
const fs = require('fs');
const migration = fs.readFileSync('./migrations/001_init.sql', 'utf8');
DB.exec(migration, (err)=>{ if (err) console.error('migration error', err); else console.log('db ready'); });


// create goal
app.post('/api/goals', async (req, res) => {
try {
const { title, recipient_name, target_amount, currency='EUR', due_date } = req.body;
const reference_code = uuidv4().slice(0,8).toUpperCase();
const sql = `INSERT INTO goals (title, recipient_name, target_amount, currency, created_by, reference_code, due_date) VALUES (?,?,?,?,?,?,?)`;
const r = await run(DB, sql, [title, recipient_name, target_amount, currency, null, reference_code, due_date]);
const id = r.id;
const goal = await get(DB, 'SELECT * FROM goals WHERE id=?', [id]);
res.json(goal);
} catch (e) { console.error(e); res.status(500).json({error: e.message}); }
});


// get goal with totals and contributors
app.get('/api/goals/:id', async (req, res) => {
try {
const id = req.params.id;
const goal = await get(DB, 'SELECT * FROM goals WHERE id=?', [id]);
if (!goal) return res.status(404).json({error:'not found'});
const contributors = await all(DB, 'SELECT * FROM contributors WHERE goal_id=?', [id]);
const payments = await all(DB, 'SELECT * FROM payments WHERE goal_id=?', [id]);
const totalPaid = payments.reduce((s,p)=>s+Number(p.amount),0);
res.json({ ...goal, contributors, payments, totalPaid, remaining: Number(goal.target_amount) - totalPaid });
} catch(e){ console.error(e); res.status(500).json({error:e.message}); }
app.listen(4000, ()=>console.log('Backend listening on http://localhost:4000'));
