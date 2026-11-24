const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authorize } = require('../../middleware/auth');
const v = require('./validate');

const router = express.Router();
const CATEGORIES = ['DAMAGE', 'MISSING_ITEM', 'LINEN_LOSS', 'SMOKING', 'EXCESSIVE_CLEANING', 'OTHER'];
const LEAVE_TYPES = ['VACATION', 'SICK', 'EMERGENCY', 'BEREAVEMENT', 'MATERNITY', 'PATERNITY', 'OTHER'];

function cleanText(value, label, max, required = false) {
  if (value === undefined || value === null) { if (required) throw new HttpError(400, `${label} is required.`); return null; }
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${label} is required.`);
  if (result.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return result || null;
}

function money(value, label, required = false) {
  if (value === undefined || value === null || value === '') { if (required) throw new HttpError(400, `${label} is required.`); return null; }
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(String(value))) throw new HttpError(400, `${label} must be a valid non-negative amount.`);
  const amount = Number(value);
  if (!Number.isSafeInteger(Math.round(amount * 100))) throw new HttpError(400, `${label} is outside the allowed range.`);
  return amount.toFixed(2);
}

const FINDING_SELECT = `SELECT f.*, r.room_number,
  CONCAT(reporter.first_name,' ',reporter.last_name) AS reported_by_name,
  CONCAT(fo.first_name,' ',fo.last_name) AS front_office_reviewer,
  CONCAT(fin.first_name,' ',fin.last_name) AS finance_reviewer
  FROM hk_charge_findings f JOIN rooms r ON r.room_id=f.room_id
  JOIN users reporter ON reporter.user_id=f.reported_by
  LEFT JOIN users fo ON fo.user_id=f.front_office_reviewed_by
  LEFT JOIN users fin ON fin.user_id=f.finance_decided_by`;

async function getFinding(client, id, lock = false) {
  const { rows } = await client.query(`${FINDING_SELECT} WHERE f.finding_id=$1${lock ? ' FOR UPDATE OF f' : ''}`, [id]);
  return rows[0] || null;
}
async function event(client, row, status, action, actor, notes) {
  await client.query(`INSERT INTO hk_charge_finding_events
    (finding_id,from_status,to_status,action,notes,actor_id,actor_role) VALUES($1,$2,$3,$4,$5,$6,$7)`,
  [row.finding_id, row.status, status, action, notes || null, actor.userId, actor.role]);
}

router.get('/charge-findings', authorize('HOUSEKEEPING'), async (req, res) => {
  const mine = req.query.scope === 'mine';
  const { rows } = await db.query(`${FINDING_SELECT} ${mine ? 'WHERE f.reported_by=$1' : ''} ORDER BY f.reported_at DESC LIMIT 200`, mine ? [req.user.userId] : []);
  res.json({ findings: rows });
});

router.post('/charge-findings', authorize('HOUSEKEEPING'), async (req, res) => {
  const body=req.body||{}; v.required(body,['roomId','category','description']);
  const roomId=v.id(body.roomId,'room'); v.oneOf(body.category,CATEGORIES,'category');
  const description=cleanText(body.description,'Description',500,true);
  const estimated=money(body.estimatedAmount,'Estimated amount');
  const created=await db.withTransaction(async(client)=>{
    const room=await client.query('SELECT room_number FROM rooms WHERE room_id=$1',[roomId]);
    if(!room.rows[0]) throw new HttpError(404,'Room not found.');
    const duplicate=await client.query(`SELECT finding_id FROM hk_charge_findings WHERE room_id=$1 AND reported_by=$2
      AND category=$3 AND description=$4 AND reported_at>NOW()-INTERVAL '2 minutes' AND status<>'WITHDRAWN'`,[roomId,req.user.userId,body.category,description]);
    if(duplicate.rows[0]) throw new HttpError(409,'This finding was already submitted.');
    const result=await client.query(`INSERT INTO hk_charge_findings(room_id,category,description,estimated_amount,reported_by)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,[roomId,body.category,description,estimated,req.user.userId]);
    await event(client,{...result.rows[0],status:null},'REPORTED','REPORTED',req.user);
    await client.query(`INSERT INTO hk_front_office_notifications(room_id,notice_type,message,created_by)
      VALUES($1,'ROOM_CONDITION',$2,$3)`,[roomId,`Charge finding ${result.rows[0].public_reference}: ${description}`.slice(0,255),req.user.userId]);
    return result.rows[0];
  });
  res.status(201).json({finding:created});
});

router.patch('/charge-findings/:id/withdraw', authorize('HOUSEKEEPING'), async(req,res)=>{
  const id=v.id(req.params.id,'finding'); const notes=cleanText(req.body?.notes,'Reason',500,true);
  const row=await db.withTransaction(async(client)=>{const current=await getFinding(client,id,true);
    if(!current) throw new HttpError(404,'Finding not found.');
    const supervisor=req.user.position==='SUPERVISOR'||req.user.role==='ADMIN';
    if(current.reported_by!==req.user.userId&&!supervisor) throw new HttpError(403,'You can withdraw only your own finding.');
    if(current.status!=='REPORTED') throw new HttpError(409,'Only an unreviewed finding can be withdrawn.');
    await event(client,current,'WITHDRAWN','WITHDRAWN',req.user,notes);
    await client.query(`UPDATE hk_charge_findings SET status='WITHDRAWN',version=version+1 WHERE finding_id=$1`,[id]); return getFinding(client,id);});
  res.json({finding:await row});
});

router.get('/integrations/front-office/charge-findings',authorize('FRONT_OFFICE'),async(_req,res)=>{
  const {rows}=await db.query(`${FINDING_SELECT} ORDER BY f.reported_at DESC LIMIT 200`);res.json({findings:rows});});
router.patch('/integrations/front-office/charge-findings/:id',authorize('FRONT_OFFICE'),async(req,res)=>{
  const id=v.id(req.params.id,'finding');const decision=String(req.body?.decision||'').toUpperCase();
  if(!['FORWARD','REJECT'].includes(decision))throw new HttpError(400,'Decision must be FORWARD or REJECT.');
  const notes=cleanText(req.body?.notes,'Review notes',500,true);const reservation=cleanText(req.body?.reservationReference,'Reservation reference',100,decision==='FORWARD');
  const result=await db.withTransaction(async(client)=>{const row=await getFinding(client,id,true);if(!row)throw new HttpError(404,'Finding not found.');
    if(row.status!=='REPORTED')throw new HttpError(409,'This finding has already been reviewed.');const status=decision==='FORWARD'?'FOR_FINANCE':'REJECTED';
    await event(client,row,status,decision==='FORWARD'?'FORWARDED_TO_FINANCE':'REJECTED_BY_FRONT_OFFICE',req.user,notes);
    await client.query(`UPDATE hk_charge_findings SET status=$1,reservation_reference=$2,front_office_reviewed_by=$3,
      front_office_reviewed_at=NOW(),front_office_notes=$4,version=version+1 WHERE finding_id=$5`,[status,reservation,req.user.userId,notes,id]);return getFinding(client,id);});
  res.json({finding:await result});
});

router.get('/integrations/finance/charge-findings',authorize('FINANCE'),async(_req,res)=>{
  const {rows}=await db.query(`${FINDING_SELECT} WHERE f.status IN ('FOR_FINANCE','APPROVED','REJECTED') ORDER BY f.reported_at DESC LIMIT 200`);res.json({findings:rows});});
router.patch('/integrations/finance/charge-findings/:id',authorize('FINANCE'),async(req,res)=>{
  const id=v.id(req.params.id,'finding');const decision=String(req.body?.decision||'').toUpperCase();if(!['APPROVE','REJECT'].includes(decision))throw new HttpError(400,'Decision must be APPROVE or REJECT.');
  const notes=cleanText(req.body?.notes,'Decision notes',500,true);const amount=money(req.body?.amount,'Final charge',decision==='APPROVE');if(decision==='APPROVE'&&Number(amount)<=0)throw new HttpError(400,'Final charge must be greater than zero.');
  const result=await db.withTransaction(async(client)=>{const row=await getFinding(client,id,true);if(!row)throw new HttpError(404,'Finding not found.');if(row.status!=='FOR_FINANCE')throw new HttpError(409,'This finding is not awaiting Finance.');
    const status=decision==='APPROVE'?'APPROVED':'REJECTED';await event(client,row,status,decision==='APPROVE'?'CHARGE_APPROVED':'REJECTED_BY_FINANCE',req.user,notes);
    await client.query(`UPDATE hk_charge_findings SET status=$1,finance_decided_by=$2,finance_decided_at=NOW(),final_amount=$3,finance_notes=$4,version=version+1 WHERE finding_id=$5`,[status,req.user.userId,decision==='APPROVE'?amount:null,notes,id]);return getFinding(client,id);});res.json({finding:await result});
});

router.get('/leave-requests',authorize('HOUSEKEEPING'),async(req,res)=>{const {rows}=await db.query(`SELECT leave_id AS id,public_reference,leave_type AS type,start_date,end_date,days,status,reason,submitted_at,decided_at,decision_notes FROM hk_leave_requests WHERE staff_id=$1 ORDER BY submitted_at DESC LIMIT 100`,[req.user.userId]);res.json({requests:rows});});
router.post('/leave-requests',authorize('HOUSEKEEPING'),async(req,res)=>{const body=req.body||{};v.required(body,['type','startDate','endDate','reason']);v.oneOf(body.type,LEAVE_TYPES,'type');const start=v.date(body.startDate,'Start date'),end=v.date(body.endDate,'End date'),reason=cleanText(body.reason,'Reason',500,true);if(end<start)throw new HttpError(400,'End date cannot be before start date.');if(start<db.today())throw new HttpError(400,'Leave cannot start in the past.');const days=Math.round((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000)+1;if(days>60)throw new HttpError(400,'A leave request cannot exceed 60 days.');
  const overlap=await db.query(`SELECT leave_id FROM hk_leave_requests WHERE staff_id=$1 AND status IN('PENDING','APPROVED') AND daterange(start_date,end_date,'[]')&&daterange($2::date,$3::date,'[]')`,[req.user.userId,start,end]);if(overlap.rows[0])throw new HttpError(409,'These dates overlap an existing leave request.');
  const {rows}=await db.query(`INSERT INTO hk_leave_requests(staff_id,leave_type,start_date,end_date,days,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.user.userId,body.type,start,end,days,reason]);res.status(201).json({request:rows[0]});});
router.patch('/leave-requests/:id/withdraw',authorize('HOUSEKEEPING'),async(req,res)=>{const result=await db.query(`UPDATE hk_leave_requests SET status='WITHDRAWN',version=version+1 WHERE (leave_id::text=$1 OR public_reference=$1) AND staff_id=$2 AND status='PENDING'`,[req.params.id,req.user.userId]);if(!result.rowCount)throw new HttpError(409,'Only your pending leave request can be withdrawn.');res.json({withdrawn:true});});

router.get('/integrations/hr/leave-requests',authorize('HR'),async(_req,res)=>{const {rows}=await db.query(`SELECT l.*,CONCAT(u.first_name,' ',u.last_name) AS staff_name,u.position FROM hk_leave_requests l JOIN users u ON u.user_id=l.staff_id ORDER BY l.submitted_at DESC LIMIT 200`);res.json({requests:rows});});
router.patch('/integrations/hr/leave-requests/:id',authorize('HR'),async(req,res)=>{const decision=String(req.body?.decision||'').toUpperCase();if(!['APPROVE','REJECT'].includes(decision))throw new HttpError(400,'Decision must be APPROVE or REJECT.');const notes=cleanText(req.body?.notes,'Decision notes',500,true);const status=decision==='APPROVE'?'APPROVED':'REJECTED';const result=await db.query(`UPDATE hk_leave_requests SET status=$1,decided_by=$2,decided_at=NOW(),decision_notes=$3,version=version+1 WHERE leave_id=$4 AND status='PENDING'`,[status,req.user.userId,notes,v.id(req.params.id,'leave request')]);if(!result.rowCount)throw new HttpError(409,'This leave request has already been decided.');res.json({status});});

module.exports=router;
