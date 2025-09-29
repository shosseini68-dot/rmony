import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 🟢 ایجاد هدف
app.post("/api/goals", async (req, res) => {
  try {
    const { title, recipient_name, target_amount, currency = "EUR", due_date } =
      req.body;
    const reference_code = uuidv4().slice(0, 8).toUpperCase();

    const result = await pool.query(
      `INSERT INTO goals (title, recipient_name, target_amount, currency, reference_code, due_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, recipient_name, target_amount, currency, reference_code, due_date]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating goal" });
  }
});

// 🟢 دریافت وضعیت هدف
app.get("/api/goals/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const goalRes = await pool.query("SELECT * FROM goals WHERE id=$1", [id]);
    if (goalRes.rows.length === 0)
      return res.status(404).json({ error: "Goal not found" });
    const goal = goalRes.rows[0];

    const contribRes = await pool.query(
      "SELECT * FROM contributors WHERE goal_id=$1",
      [id]
    );
    const payRes = await pool.query(
      "SELECT * FROM payments WHERE goal_id=$1",
      [id]
    );

    const totalPaid = payRes.rows.reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      ...goal,
      contributors: contribRes.rows,
      payments: payRes.rows,
      totalPaid,
      remaining: Number(goal.target_amount) - totalPaid,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching goal" });
  }
});

// 🟢 اضافه کردن مشارکت‌کننده
app.post("/api/goals/:id/contributors", async (req, res) => {
  try {
    const goal_id = req.params.id;
    const { name, email, phone, committed_amount } = req.body;

    const result = await pool.query(
      `INSERT INTO contributors (goal_id, name, email, phone, committed_amount)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [goal_id, name, email, phone, committed_amount]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error adding contributor" });
  }
});

// 🟢 ثبت پرداخت
app.post("/api/goals/:id/payments", async (req, res) => {
  try {
    const goal_id = req.params.id;
    const { contributor_id, amount, method, notes } = req.body;

    const payRes = await pool.query(
      `INSERT INTO payments (goal_id, contributor_id, amount, method, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [goal_id, contributor_id, amount, method, notes]
    );

    // بررسی تکمیل هدف
    const sumRes = await pool.query(
      "SELECT SUM(amount) AS total FROM payments WHERE goal_id=$1",
      [goal_id]
    );
    const totalPaid = sumRes.rows[0].total || 0;

    const goalRes = await pool.query("SELECT * FROM goals WHERE id=$1", [
      goal_id,
    ]);
    const goal = goalRes.rows[0];

    if (totalPaid >= Number(goal.target_amount) && goal.status !== "completed") {
      await pool.query("UPDATE goals SET status='completed' WHERE id=$1", [
        goal_id,
      ]);
    }

    res.json({ payment: payRes.rows[0], totalPaid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error recording payment" });
  }
});

// 🟢 سلامت
app.get("/api/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend running on port ${port}`));
