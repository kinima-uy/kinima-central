import express from 'express';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createKinimaPool } from './db.js';

const scrypt = promisify(scryptCallback);
const pool = createKinimaPool({ max: process.env.VERCEL ? 5 : 12 });
const HOST = process.env.API_HOST || '127.0.0.1';
const PORT = Number(process.env.API_PORT || 4174);
const JWT_SECRET = process.env.JWT_SECRET || '';
const BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN || '';
const PRODUCTION = process.env.NODE_ENV === 'production';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = resolve(ROOT, 'public');
const LIMITS = new Map();
const MAX_BODY_BYTES = 512 * 1024;
const TOKEN_TTL = 8 * 60 * 60;

if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios.');

function json(res, status, value) {
  const text = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin'
  });
  res.end(text);
}
function fail(res, status, code, message) { json(res, status, { error: { code, message } }); }
function headers(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}
async function body(req) { return req.body && typeof req.body === 'object' ? req.body : {}; }
function equal(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const key = Buffer.from(await scrypt(password, salt, 64)).toString('base64url');
  return `scrypt$${salt}$${key}`;
}
async function checkPassword(password, stored) {
  const [algorithm, salt, encoded] = String(stored || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !encoded) return false;
  const key = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(encoded, 'base64url');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
function signToken(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL })).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyToken(value) {
  const [payload, signature] = String(value || '').split('.');
  if (!payload || !signature || !equal(signature, createHmac('sha256', JWT_SECRET).update(payload).digest('base64url'))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.sub && data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}
function validUuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validExercise(value) {
  return value && typeof value === 'object' && ['short','medium','wide'].includes(value.horizontalRange) &&
    ['low','medium','high'].includes(value.verticalRange) && ['left','center','right','bilateral'].includes(value.workZone) &&
    ['large','medium','small'].includes(value.targetSize) && Number.isInteger(value.durationSeconds) && value.durationSeconds >= 15 && value.durationSeconds <= 600;
}
function sameExercise(a, b) {
  return ['horizontalRange','verticalRange','workZone','targetSize','durationSeconds'].every((key) => a?.[key] === b?.[key]);
}
function limited(req, res, name, max, durationMs) {
  const ip = req.socket.remoteAddress || 'local'; const key = `${name}:${ip}`; const now = Date.now(); const entry = LIMITS.get(key);
  if (!entry || entry.until < now) { LIMITS.set(key, { count: 1, until: now + durationMs }); return false; }
  entry.count += 1;
  if (entry.count <= max) return false;
  res.setHeader('retry-after', String(Math.ceil((entry.until - now) / 1000)));
  fail(res, 429, 'rate_limited', 'Demasiados intentos; esperá un momento y volvé a intentar.');
  return true;
}
async function professional(req, res) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); const token = match && verifyToken(match[1]);
  if (!token) { fail(res, 401, 'unauthorized', 'Iniciá sesión para continuar.'); return null; }
  const result = await pool.query('SELECT id,email,display_name,role FROM professionals WHERE id=$1 AND active=TRUE', [token.sub]);
  if (!result.rowCount) { fail(res, 401, 'unauthorized', 'La cuenta no está activa.'); return null; }
  return result.rows[0];
}
async function device(req, res) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!match) { fail(res, 401, 'device_unauthorized', 'Falta la credencial de la consola.'); return null; }
  const result = await pool.query('SELECT id,device_code FROM devices WHERE credential_hash=$1 AND active=TRUE', [hashToken(match[1])]);
  if (!result.rowCount) { fail(res, 401, 'device_unauthorized', 'La credencial de la consola no es válida.'); return null; }
  return result.rows[0];
}
async function family(req, res) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); const token = match && verifyToken(match[1]);
  if (!token) { fail(res, 401, 'unauthorized', 'Iniciá sesión para continuar.'); return null; }
  const result = await pool.query('SELECT id,email,display_name FROM families WHERE id=$1 AND active=TRUE', [token.sub]);
  if (!result.rowCount) { fail(res, 401, 'unauthorized', 'La cuenta no está activa.'); return null; }
  return result.rows[0];
}
async function canFamilyAccessPatient(familyId, patientId) {
  const found = await pool.query('SELECT 1 FROM family_patient_access WHERE family_id=$1 AND patient_id=$2', [familyId, patientId]);
  return found.rowCount > 0;
}
async function audit(client, actorId, action, type, subjectId, details = {}, deviceId = null) {
  await client.query('INSERT INTO audit_events(id,actor_professional_id,device_id,action,subject_type,subject_id,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [randomUUID(), actorId, deviceId, action, type, subjectId, JSON.stringify(details)]);
}
async function canAccessPatient(actor, id) {
  if (actor.role === 'administrator') return true;
  const found = await pool.query('SELECT 1 FROM professional_patient_access WHERE professional_id=$1 AND patient_id=$2', [actor.id, id]);
  return found.rowCount > 0;
}
async function canAccessDevice(actor, id) {
  if (actor.role === 'administrator') return true;
  const found = await pool.query('SELECT 1 FROM professional_device_access WHERE professional_id=$1 AND device_id=$2', [actor.id, id]);
  return found.rowCount > 0;
}

async function setupStatus(res) {
  const result = await pool.query("SELECT COUNT(*)::integer AS count FROM professionals WHERE role='administrator'");
  json(res, 200, { needsFirstAdmin: result.rows[0].count === 0 });
}
async function bootstrapAdmin(input, res) {
  if (!BOOTSTRAP_TOKEN || !equal(input.bootstrapToken || '', BOOTSTRAP_TOKEN)) { fail(res, 403, 'bootstrap_denied', 'El código inicial no es válido.'); return; }
  if (!validEmail(input.email) || typeof input.displayName !== 'string' || input.displayName.trim().length < 2 || input.displayName.trim().length > 100 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) {
    fail(res, 400, 'invalid_input', 'Revisá el correo y el nombre. La contraseña debe tener al menos 12 caracteres.'); return;
  }
  const client = await pool.connect(); const id = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('kinima-first-admin'))");
    const count = await client.query("SELECT COUNT(*)::integer AS count FROM professionals WHERE role='administrator'");
    if (count.rows[0].count) { await client.query('ROLLBACK'); fail(res, 409, 'already_bootstrapped', 'La cuenta inicial ya fue creada.'); return; }
    await client.query('INSERT INTO professionals(id,email,password_hash,display_name,role) VALUES($1,lower($2),$3,$4,$5)',
      [id, input.email.trim(), await hashPassword(input.password), input.displayName.trim(), 'administrator']);
    await audit(client, id, 'professional.bootstrap', 'professional', id, { email: input.email.trim().toLowerCase() });
    await client.query('COMMIT');
    json(res, 201, { accessToken: signToken(id), expiresIn: TOKEN_TTL, professional: { id, email: input.email.trim().toLowerCase(), displayName: input.displayName.trim(), role: 'administrator' } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { fail(res, 409, 'email_exists', 'Ya existe una cuenta con ese correo.'); return; }
    throw error;
  } finally { client.release(); }
}
async function login(input, req, res) {
  if (limited(req, res, 'login', 10, 15 * 60 * 1000)) return;
  if (!validEmail(input.email) || typeof input.password !== 'string' || input.password.length > 128) { fail(res, 401, 'invalid_credentials', 'El correo o la contraseña no coinciden.'); return; }
  const result = await pool.query('SELECT id,email,password_hash,display_name,role FROM professionals WHERE lower(email)=lower($1) AND active=TRUE', [input.email.trim()]);
  const user = result.rows[0];
  if (!user) await scrypt(input.password, 'kinima-constant-login-salt', 64);
  else if (!(await checkPassword(input.password, user.password_hash))) { fail(res, 401, 'invalid_credentials', 'El correo o la contraseña no coinciden.'); return; }
  if (!user) { fail(res, 401, 'invalid_credentials', 'El correo o la contraseña no coinciden.'); return; }
  json(res, 200, { accessToken: signToken(user.id), expiresIn: TOKEN_TTL, professional: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
}
async function familyLogin(input, req, res) {
  if (limited(req, res, 'family-login', 10, 15 * 60 * 1000)) return;
  if (!validEmail(input.email) || typeof input.password !== 'string' || input.password.length > 128) { fail(res, 401, 'invalid_credentials', 'El correo o la contraseña no coinciden.'); return; }
  const result = await pool.query('SELECT id,email,password_hash,display_name FROM families WHERE lower(email)=lower($1) AND active=TRUE', [input.email.trim()]);
  const user = result.rows[0];
  if (!user) await scrypt(input.password, 'kinima-constant-login-salt', 64);
  else if (!(await checkPassword(input.password, user.password_hash))) { fail(res, 401, 'invalid_credentials', 'El correo o la contraseña no coinciden.'); return; }
  if (!user) { fail(res, 401, 'invalid_credentials', 'El correo o la contraseña no coinciden.'); return; }
  json(res, 200, { accessToken: signToken(user.id), expiresIn: TOKEN_TTL, family: { id: user.id, email: user.email, displayName: user.display_name } });
}
async function createFamily(input, actor, res) {
  if (!validUuid(input.patientId) || !(await canAccessPatient(actor, input.patientId))) { fail(res, 403, 'forbidden', 'No tenés acceso a ese paciente.'); return; }
  if (!validEmail(input.email) || typeof input.displayName !== 'string' || input.displayName.trim().length < 2 || input.displayName.trim().length > 100) {
    fail(res, 400, 'invalid_input', 'Revisá el correo y el nombre de la familia.'); return;
  }
  const id = randomUUID(); const temporaryPassword = randomBytes(9).toString('base64url'); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO families(id,email,password_hash,display_name,created_by) VALUES($1,lower($2),$3,$4,$5)',
      [id, input.email.trim(), await hashPassword(temporaryPassword), input.displayName.trim(), actor.id]);
    await client.query('INSERT INTO family_patient_access(family_id,patient_id) VALUES($1,$2)', [id, input.patientId]);
    await audit(client, actor.id, 'family.created', 'family', id, { email: input.email.trim().toLowerCase(), patientId: input.patientId });
    await client.query('COMMIT');
    json(res, 201, { family: { id, email: input.email.trim().toLowerCase(), displayName: input.displayName.trim() }, temporaryPassword });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { fail(res, 409, 'email_exists', 'Ya existe una cuenta de familia con ese correo.'); return; }
    throw error;
  } finally { client.release(); }
}
async function listPatientFamilies(actor, patientId, res) {
  if (!validUuid(patientId) || !(await canAccessPatient(actor, patientId))) { fail(res, 404, 'not_found', 'No se encontró el paciente.'); return; }
  const result = await pool.query(`SELECT f.id,f.email,f.display_name FROM family_patient_access a
    JOIN families f ON f.id=a.family_id AND f.active=TRUE WHERE a.patient_id=$1 ORDER BY f.display_name`, [patientId]);
  json(res, 200, { families: result.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name })) });
}
async function grantFamilyAccess(input, actor, patientId, res) {
  if (!validUuid(patientId) || !validUuid(input.familyId) || !(await canAccessPatient(actor, patientId))) { fail(res, 400, 'invalid_input', 'El identificador no es válido.'); return; }
  const result = await pool.query(`INSERT INTO family_patient_access(family_id,patient_id)
    SELECT f.id,pt.id FROM families f,patients pt WHERE f.id=$1 AND f.active=TRUE AND pt.id=$2 AND pt.active=TRUE
    ON CONFLICT DO NOTHING RETURNING patient_id`, [input.familyId, patientId]);
  if (!result.rowCount) {
    const existing = await pool.query(`SELECT 1 FROM family_patient_access a
      JOIN families f ON f.id=a.family_id AND f.active=TRUE
      JOIN patients pt ON pt.id=a.patient_id AND pt.active=TRUE
      WHERE a.family_id=$1 AND a.patient_id=$2`, [input.familyId, patientId]);
    if (!existing.rowCount) { fail(res, 404, 'not_found', 'No se encontró la cuenta de familia o el paciente.'); return; }
    json(res, 200, { granted: true });
    return;
  }
  await pool.query('INSERT INTO audit_events(id,actor_professional_id,action,subject_type,subject_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
    [randomUUID(), actor.id, 'family.access.granted', 'patient', patientId, JSON.stringify({ familyId: input.familyId })]);
  json(res, 200, { granted: true });
}
async function revokeFamilyAccess(input, actor, patientId, res) {
  if (!validUuid(patientId) || !validUuid(input.familyId) || !(await canAccessPatient(actor, patientId))) { fail(res, 400, 'invalid_input', 'El identificador no es válido.'); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query('DELETE FROM family_patient_access WHERE family_id=$1 AND patient_id=$2 RETURNING patient_id', [input.familyId, patientId]);
    if (!removed.rowCount) { await client.query('ROLLBACK'); fail(res, 404, 'not_found', 'No se encontró ese acceso.'); return; }
    await audit(client, actor.id, 'family.access.revoked', 'patient', patientId, { familyId: input.familyId });
    await client.query('COMMIT');
    json(res, 200, { revoked: true });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
async function listFamilyPatients(actor, res) {
  const result = await pool.query(`SELECT p.id,p.local_code,p.display_label FROM family_patient_access a
    JOIN patients p ON p.id=a.patient_id AND p.active=TRUE WHERE a.family_id=$1 ORDER BY p.local_code`, [actor.id]);
  json(res, 200, { patients: result.rows.map((row) => ({ id: row.id, localCode: row.local_code, displayLabel: row.display_label })) });
}
async function familyPatientAssignment(actor, patientId, res) {
  if (!validUuid(patientId) || !(await canFamilyAccessPatient(actor.id, patientId))) { fail(res, 404, 'not_found', 'No se encontró el paciente.'); return; }
  const result = await pool.query(`SELECT version,exercise_config,created_at FROM assignments WHERE patient_id=$1 AND status='active' LIMIT 1`, [patientId]);
  const row = result.rows[0];
  json(res, 200, { assignment: row ? { version: Number(row.version), exercise: row.exercise_config, createdAt: row.created_at } : null });
}
async function familyPatientSessions(actor, patientId, url, res) {
  if (!validUuid(patientId) || !(await canFamilyAccessPatient(actor.id, patientId))) { fail(res, 404, 'not_found', 'No se encontró el paciente.'); return; }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const result = await pool.query(`SELECT id,started_at,duration_seconds,elapsed_seconds,hits,completed FROM sessions WHERE patient_id=$1 ORDER BY started_at DESC LIMIT $2`, [patientId, limit]);
  json(res, 200, { sessions: result.rows.map((row) => ({ id: row.id, startedAt: row.started_at, durationSeconds: row.duration_seconds, elapsedSeconds: row.elapsed_seconds, hits: row.hits, completed: row.completed })) });
}
async function createProfessional(input, actor, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede crear usuarios.'); return; }
  const role = input.role || 'professional';
  if (!validEmail(input.email) || typeof input.displayName !== 'string' || input.displayName.trim().length < 2 || input.displayName.trim().length > 100 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128 || !['professional','administrator'].includes(role)) {
    fail(res, 400, 'invalid_input', 'Revisá los datos; la contraseña debe tener al menos 12 caracteres.'); return;
  }
  const id = randomUUID(); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO professionals(id,email,password_hash,display_name,role) VALUES($1,lower($2),$3,$4,$5)',
      [id, input.email.trim(), await hashPassword(input.password), input.displayName.trim(), role]);
    await audit(client, actor.id, 'professional.created', 'professional', id, { email: input.email.trim().toLowerCase(), role });
    await client.query('COMMIT');
    json(res, 201, { professional: { id, email: input.email.trim().toLowerCase(), displayName: input.displayName.trim(), role } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { fail(res, 409, 'email_exists', 'Ya existe una cuenta con ese correo.'); return; }
    throw error;
  } finally { client.release(); }
}
async function createPatient(input, actor, res) {
  const localCode = typeof input.localCode === 'string' ? input.localCode.trim() : '';
  const displayLabel = typeof input.displayLabel === 'string' ? input.displayLabel.trim() : '';
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(localCode) || displayLabel.length < 1 || displayLabel.length > 80) { fail(res, 400, 'invalid_input', 'Ingresá un código local y una etiqueta corta; no uses el nombre completo.'); return; }
  const id = randomUUID(); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO patients(id,local_code,display_label,created_by) VALUES($1,$2,$3,$4)', [id, localCode, displayLabel, actor.id]);
    if (actor.role === 'professional') await client.query('INSERT INTO professional_patient_access(professional_id,patient_id) VALUES($1,$2)', [actor.id, id]);
    await audit(client, actor.id, 'patient.created', 'patient', id, { localCode });
    await client.query('COMMIT');
    json(res, 201, { patient: { id, localCode, displayLabel } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { fail(res, 409, 'patient_code_exists', 'Ese código local ya está registrado.'); return; }
    throw error;
  } finally { client.release(); }
}
async function createDevice(input, actor, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede registrar consolas.'); return; }
  const deviceCode = typeof input.deviceCode === 'string' ? input.deviceCode.trim() : '';
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(deviceCode) || displayName.length < 1 || displayName.length > 80) { fail(res, 400, 'invalid_input', 'Ingresá un código de consola y una etiqueta corta.'); return; }
  const id = randomUUID(); const deviceToken = randomBytes(32).toString('base64url'); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO devices(id,device_code,display_name,credential_hash) VALUES($1,$2,$3,$4)', [id, deviceCode, displayName, hashToken(deviceToken)]);
    await audit(client, actor.id, 'device.created', 'device', id, { deviceCode }, id);
    await client.query('COMMIT');
    json(res, 201, { device: { id, deviceCode, displayName }, deviceToken });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { fail(res, 409, 'device_code_exists', 'Ese código de consola ya está en uso.'); return; }
    throw error;
  } finally { client.release(); }
}
async function rotateDeviceToken(actor, deviceId, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede renovar credenciales.'); return; }
  if (!validUuid(deviceId)) { fail(res, 400, 'invalid_input', 'El identificador de la consola no es válido.'); return; }
  const deviceToken = randomBytes(32).toString('base64url');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE devices SET credential_hash=$1 WHERE id=$2 AND active=TRUE RETURNING id', [hashToken(deviceToken), deviceId]);
    if (!result.rowCount) { await client.query('ROLLBACK'); fail(res, 404, 'not_found', 'No se encontró una consola activa.'); return; }
    await audit(client, actor.id, 'device.credential.rotated', 'device', deviceId, {}, deviceId);
    await client.query('COMMIT');
    json(res, 200, { deviceId, deviceToken });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
async function grantDeviceAccess(input, actor, deviceId, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede compartir consolas.'); return; }
  if (!validUuid(deviceId) || !validUuid(input.professionalId)) { fail(res, 400, 'invalid_input', 'El identificador no es válido.'); return; }
  const result = await pool.query(`INSERT INTO professional_device_access(professional_id,device_id)
    SELECT p.id,d.id FROM professionals p,devices d WHERE p.id=$1 AND p.active=TRUE AND p.role='professional' AND d.id=$2 AND d.active=TRUE
    ON CONFLICT DO NOTHING RETURNING professional_id`, [input.professionalId, deviceId]);
  if (!result.rowCount) {
    const existing = await pool.query(`SELECT 1 FROM professional_device_access a
      JOIN professionals p ON p.id=a.professional_id AND p.active=TRUE AND p.role='professional'
      JOIN devices d ON d.id=a.device_id AND d.active=TRUE
      WHERE a.professional_id=$1 AND a.device_id=$2`, [input.professionalId, deviceId]);
    if (!existing.rowCount) { fail(res, 404, 'not_found', 'No se encontró la cuenta o la consola.'); return; }
    json(res, 200, { granted: true });
    return;
  }
  await pool.query('INSERT INTO audit_events(id,actor_professional_id,device_id,action,subject_type,subject_id,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [randomUUID(), actor.id, deviceId, 'device.access.granted', 'professional', input.professionalId, JSON.stringify({ deviceId })]);
  json(res, 200, { granted: true });
}
async function listAccess(actor, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede gestionar permisos.'); return; }
  const [patients, devices] = await Promise.all([
    pool.query(`SELECT a.professional_id,p.display_name,p.email,pt.id AS patient_id,pt.local_code,pt.display_label
      FROM professional_patient_access a
      JOIN professionals p ON p.id=a.professional_id AND p.active=TRUE AND p.role='professional'
      JOIN patients pt ON pt.id=a.patient_id AND pt.active=TRUE
      ORDER BY pt.local_code,p.display_name`),
    pool.query(`SELECT a.professional_id,p.display_name,p.email,d.id AS device_id,d.device_code,d.display_name AS device_name
      FROM professional_device_access a
      JOIN professionals p ON p.id=a.professional_id AND p.active=TRUE AND p.role='professional'
      JOIN devices d ON d.id=a.device_id AND d.active=TRUE
      ORDER BY d.device_code,p.display_name`)
  ]);
  json(res, 200, {
    patientAccess: patients.rows.map((row) => ({
      professionalId: row.professional_id, professionalName: row.display_name, professionalEmail: row.email,
      patientId: row.patient_id, patientCode: row.local_code, patientLabel: row.display_label
    })),
    deviceAccess: devices.rows.map((row) => ({
      professionalId: row.professional_id, professionalName: row.display_name, professionalEmail: row.email,
      deviceId: row.device_id, deviceCode: row.device_code, deviceName: row.device_name
    }))
  });
}
async function revokePatientAccess(input, actor, patientId, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede revocar permisos.'); return; }
  if (!validUuid(patientId) || !validUuid(input.professionalId)) { fail(res, 400, 'invalid_input', 'El identificador no es válido.'); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query('DELETE FROM professional_patient_access WHERE professional_id=$1 AND patient_id=$2 RETURNING patient_id', [input.professionalId, patientId]);
    if (!removed.rowCount) { await client.query('ROLLBACK'); fail(res, 404, 'not_found', 'No se encontró ese acceso al paciente.'); return; }
    await audit(client, actor.id, 'patient.access.revoked', 'patient', patientId, { professionalId: input.professionalId });
    await client.query('COMMIT');
    json(res, 200, { revoked: true });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
async function revokeDeviceAccess(input, actor, deviceId, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede revocar permisos.'); return; }
  if (!validUuid(deviceId) || !validUuid(input.professionalId)) { fail(res, 400, 'invalid_input', 'El identificador no es válido.'); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query('DELETE FROM professional_device_access WHERE professional_id=$1 AND device_id=$2 RETURNING device_id', [input.professionalId, deviceId]);
    if (!removed.rowCount) { await client.query('ROLLBACK'); fail(res, 404, 'not_found', 'No se encontró ese acceso a la consola.'); return; }
    await audit(client, actor.id, 'device.access.revoked', 'device', deviceId, { professionalId: input.professionalId }, deviceId);
    await client.query('COMMIT');
    json(res, 200, { revoked: true });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
async function listPatients(actor, res) {
  const result = actor.role === 'administrator'
    ? await pool.query('SELECT id,local_code,display_label,created_at FROM patients WHERE active=TRUE ORDER BY local_code')
    : await pool.query(`SELECT p.id,p.local_code,p.display_label,p.created_at FROM patients p
       JOIN professional_patient_access a ON a.patient_id=p.id WHERE a.professional_id=$1 AND p.active=TRUE ORDER BY p.local_code`, [actor.id]);
  json(res, 200, { patients: result.rows.map((row) => ({ id: row.id, localCode: row.local_code, displayLabel: row.display_label, createdAt: row.created_at })) });
}
async function listDevices(actor, res) {
  const query = actor.role === 'administrator'
    ? `SELECT d.id,d.device_code,d.display_name,d.last_seen_at,a.patient_id,a.version,a.exercise_config,p.local_code,p.display_label
       FROM devices d LEFT JOIN assignments a ON a.device_id=d.id AND a.status='active'
       LEFT JOIN patients p ON p.id=a.patient_id WHERE d.active=TRUE ORDER BY d.device_code`
    : `SELECT d.id,d.device_code,d.display_name,d.last_seen_at,a.patient_id,a.version,a.exercise_config,p.local_code,p.display_label
       FROM devices d JOIN professional_device_access da ON da.device_id=d.id
       LEFT JOIN assignments a ON a.device_id=d.id AND a.status='active'
       LEFT JOIN patients p ON p.id=a.patient_id WHERE da.professional_id=$1 AND d.active=TRUE ORDER BY d.device_code`;
  const result = actor.role === 'administrator' ? await pool.query(query) : await pool.query(query, [actor.id]);
  json(res, 200, { devices: result.rows.map((row) => ({
    id: row.id, deviceCode: row.device_code, displayName: row.display_name, lastSeenAt: row.last_seen_at,
    activeAssignment: row.patient_id ? { patientId: row.patient_id, patientCode: row.local_code, patientLabel: row.display_label, version: Number(row.version), exercise: row.exercise_config } : null
  })) });
}
async function assignDevice(input, actor, deviceId, res) {
  if (!validUuid(deviceId) || !validUuid(input.patientId) || !validExercise(input.exercise)) { fail(res, 400, 'invalid_input', 'Revisá la consola, el paciente y la configuración.'); return; }
  if (!(await canDeviceAssignment(actor, deviceId)) || !(await canPatientAssignment(actor, input.patientId))) { fail(res, 403, 'forbidden', 'No tenés permiso para esta asignación.'); return; }
  const client = await pool.connect(); const id = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`kinima-device-${deviceId}`]);
    const latest = await client.query('SELECT COALESCE(MAX(version),0)::integer AS version FROM assignments WHERE device_id=$1', [deviceId]);
    const version = Number(latest.rows[0].version) + 1;
    await client.query("UPDATE assignments SET status='revoked',revoked_at=now() WHERE device_id=$1 AND status='active'", [deviceId]);
    await client.query(`INSERT INTO assignments(id,device_id,patient_id,version,status,exercise_config,assigned_by)
       VALUES($1,$2,$3,$4,'active',$5::jsonb,$6)`, [id, deviceId, input.patientId, version, JSON.stringify(input.exercise), actor.id]);
    await audit(client, actor.id, 'assignment.created', 'assignment', id, { patientId: input.patientId, version, exercise: input.exercise }, deviceId);
    await client.query('COMMIT');
    json(res, 201, { assignment: { id, deviceId, patientId: input.patientId, version, status: 'active', exercise: input.exercise } });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
async function canDeviceAssignment(actor, id) {
  const active = await pool.query('SELECT 1 FROM devices WHERE id=$1 AND active=TRUE', [id]);
  return active.rowCount > 0 && await canAccessDevice(actor, id);
}
async function canPatientAssignment(actor, id) {
  const active = await pool.query('SELECT 1 FROM patients WHERE id=$1 AND active=TRUE', [id]);
  return active.rowCount > 0 && await canAccessPatient(actor, id);
}
async function revokeAssignment(actor, deviceId, res) {
  if (!validUuid(deviceId) || !(await canDeviceAssignment(actor, deviceId))) { fail(res, 404, 'not_found', 'No se encontró la consola.'); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("UPDATE assignments SET status='revoked',revoked_at=now() WHERE device_id=$1 AND status='active' RETURNING id,patient_id,version", [deviceId]);
    if (result.rowCount) await audit(client, actor.id, 'assignment.revoked', 'assignment', result.rows[0].id, { patientId: result.rows[0].patient_id, version: Number(result.rows[0].version) }, deviceId);
    await client.query('COMMIT');
    json(res, 200, { revoked: result.rowCount > 0 });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
async function listSessions(actor, patientId, url, res) {
  if (!validUuid(patientId) || !(await canAccessPatient(actor, patientId))) { fail(res, 404, 'not_found', 'No se encontró el paciente.'); return; }
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const result = await pool.query(`SELECT id,device_id,assignment_version,started_at,duration_seconds,elapsed_seconds,hits,completed,exercise_config,received_at
    FROM sessions WHERE patient_id=$1 ORDER BY started_at DESC LIMIT $2`, [patientId, limit]);
  json(res, 200, { sessions: result.rows.map((row) => ({
    id: row.id, deviceId: row.device_id, assignmentVersion: Number(row.assignment_version), startedAt: row.started_at,
    durationSeconds: row.duration_seconds, elapsedSeconds: row.elapsed_seconds, hits: row.hits, completed: row.completed,
    configuration: row.exercise_config, receivedAt: row.received_at
  })) });
}
// Historial de rutinas de un paciente (todas las versiones, en todas las consolas). Lo usa el portal.
async function listAssignments(actor, patientId, res) {
  if (!validUuid(patientId) || !(await canAccessPatient(actor, patientId))) { fail(res, 404, 'not_found', 'No se encontró el paciente.'); return; }
  const result = await pool.query(`SELECT a.id,a.device_id,d.device_code,a.version,a.status,a.exercise_config,a.created_at,a.revoked_at
    FROM assignments a JOIN devices d ON d.id=a.device_id WHERE a.patient_id=$1 ORDER BY a.created_at DESC LIMIT 100`, [patientId]);
  json(res, 200, { assignments: result.rows.map((row) => ({
    id: row.id, deviceId: row.device_id, deviceCode: row.device_code, version: Number(row.version), status: row.status,
    exercise: row.exercise_config, createdAt: row.created_at, revokedAt: row.revoked_at
  })) });
}
async function syncDevice(deviceRow, res) {
  await pool.query('UPDATE devices SET last_seen_at=now() WHERE id=$1', [deviceRow.id]);
  const result = await pool.query(`SELECT a.version,a.patient_id,a.status,a.exercise_config,p.local_code
    FROM assignments a JOIN patients p ON p.id=a.patient_id WHERE a.device_id=$1 AND a.status='active' LIMIT 1`, [deviceRow.id]);
  const row = result.rows[0];
  const recent = row ? await pool.query(`SELECT id,patient_id,assignment_version,started_at,duration_seconds,elapsed_seconds,hits,completed,exercise_config
    FROM sessions WHERE device_id=$1 AND patient_id=$2 ORDER BY started_at DESC LIMIT 20`, [deviceRow.id, row.patient_id]) : { rows: [] };
  json(res, 200, {
    deviceId: deviceRow.id,
    serverTime: new Date().toISOString(),
    assignment: row ? { version: Number(row.version), patientId: row.patient_id, patientCode: row.local_code, status: row.status, exercise: row.exercise_config } : null,
    recentSessions: recent.rows.map((item) => ({
      id: item.id, patientId: item.patient_id, assignmentVersion: Number(item.assignment_version), startedAt: item.started_at,
      createdAt: item.started_at, durationSeconds: item.duration_seconds, elapsedSeconds: item.elapsed_seconds, hits: item.hits,
      completed: item.completed, configuration: item.exercise_config
    }))
  });
}
function validIncomingSession(session) {
  return session && typeof session === 'object' && validUuid(session.id) && validUuid(session.patientId) &&
    Number.isInteger(session.assignmentVersion) && session.assignmentVersion > 0 &&
    typeof session.startedAt === 'string' && Number.isFinite(Date.parse(session.startedAt)) &&
    Number.isInteger(session.durationSeconds) && session.durationSeconds >= 1 && session.durationSeconds <= 3600 &&
    Number.isInteger(session.elapsedSeconds) && session.elapsedSeconds >= 1 && session.elapsedSeconds <= session.durationSeconds &&
    Number.isInteger(session.hits) && session.hits >= 0 && typeof session.completed === 'boolean' && validExercise(session.configuration) &&
    session.configuration.durationSeconds === session.durationSeconds;
}
async function receiveSessions(input, deviceRow, res) {
  if (!Array.isArray(input.sessions) || input.sessions.length < 1 || input.sessions.length > 50) { fail(res, 400, 'invalid_batch', 'Enviá entre 1 y 50 sesiones por lote.'); return; }
  const accepted = []; const rejected = []; const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const session of input.sessions) {
      if (!validIncomingSession(session)) { rejected.push({ id: session?.id || null, reason: 'invalid_session' }); continue; }
      const assignment = await client.query('SELECT exercise_config FROM assignments WHERE device_id=$1 AND patient_id=$2 AND version=$3', [deviceRow.id, session.patientId, session.assignmentVersion]);
      if (!assignment.rowCount || !sameExercise(assignment.rows[0].exercise_config, session.configuration)) { rejected.push({ id: session.id, reason: 'assignment_mismatch' }); continue; }
      const inserted = await client.query(`INSERT INTO sessions(id,device_id,patient_id,assignment_version,started_at,duration_seconds,elapsed_seconds,hits,completed,exercise_config)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [session.id, deviceRow.id, session.patientId, session.assignmentVersion, session.startedAt, session.durationSeconds, session.elapsedSeconds, session.hits, session.completed, JSON.stringify(session.configuration)]);
      if (inserted.rowCount) { accepted.push(session.id); continue; }
      const existing = await client.query(`SELECT device_id,patient_id,assignment_version,started_at,duration_seconds,elapsed_seconds,hits,completed,exercise_config
        FROM sessions WHERE id=$1`, [session.id]);
      const row = existing.rows[0];
      const sameRecord = row && row.device_id === deviceRow.id && row.patient_id === session.patientId &&
        Number(row.assignment_version) === session.assignmentVersion && new Date(row.started_at).getTime() === Date.parse(session.startedAt) &&
        row.duration_seconds === session.durationSeconds && row.elapsed_seconds === session.elapsedSeconds &&
        row.hits === session.hits && row.completed === session.completed && sameExercise(row.exercise_config, session.configuration);
      if (sameRecord) accepted.push(session.id);
      else rejected.push({ id: session.id, reason: 'id_conflict' });
    }
    await client.query('COMMIT');
    await pool.query('UPDATE devices SET last_seen_at=now() WHERE id=$1', [deviceRow.id]);
    json(res, 200, { accepted, rejected });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function route(req, res) {
  if (PRODUCTION && !req.socket.encrypted && req.headers['x-forwarded-proto'] !== 'https') { fail(res, 400, 'https_required', 'La API requiere una conexión HTTPS.'); return; }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  if (req.method === 'GET' && path === '/api/v1/health') {
    await pool.query('SELECT 1');
    json(res, 200, { status: 'ok', service: 'kinima-central-api', apiVersion: 1 });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/setup/status') { await setupStatus(res); return; }

  if (req.method === 'POST' && path === '/api/v1/setup/first-admin') {
    const input = await body(req);
    if (limited(req, res, 'bootstrap', 5, 60 * 60 * 1000)) return;
    await bootstrapAdmin(input, res); return;
  }
  if (req.method === 'POST' && path === '/api/v1/auth/login') { await login(await body(req), req, res); return; }
  if (req.method === 'POST' && path === '/api/v1/family/auth/login') { await familyLogin(await body(req), req, res); return; }

  if (path.startsWith('/api/v1/family/')) {
    const actor = await family(req, res); if (!actor) return;
    const suffix = path.slice('/api/v1/family/'.length);
    if (req.method === 'GET' && suffix === 'me') { json(res, 200, { family: { id: actor.id, email: actor.email, displayName: actor.display_name } }); return; }
    if (req.method === 'GET' && suffix === 'patients') { await listFamilyPatients(actor, res); return; }
    if (req.method === 'GET' && /^patients\/[0-9a-f-]+\/assignment$/.test(suffix)) { await familyPatientAssignment(actor, suffix.split('/')[1], res); return; }
    if (req.method === 'GET' && /^patients\/[0-9a-f-]+\/sessions$/.test(suffix)) { await familyPatientSessions(actor, suffix.split('/')[1], url, res); return; }
    fail(res, 404, 'not_found', 'No se encontró esta ruta.'); return;
  }

  if (req.method === 'POST' && path === '/api/v1/device/sync') {
    const deviceRow = await device(req, res); if (!deviceRow) return;
    await syncDevice(deviceRow, res); return;
  }
  if (req.method === 'POST' && path === '/api/v1/sessions/batch') {
    const deviceRow = await device(req, res); if (!deviceRow) return;
    await receiveSessions(await body(req), deviceRow, res); return;
  }

  if (path.startsWith('/api/v1/professional/') || path.startsWith('/api/v1/admin/')) {
    const actor = await professional(req, res); if (!actor) return;
    const suffix = path.slice('/api/v1/'.length);
    if (req.method === 'GET' && suffix === 'professional/me') {
      json(res, 200, { professional: { id: actor.id, email: actor.email, displayName: actor.display_name, role: actor.role } }); return;
    }
    if (req.method === 'GET' && suffix === 'professional/patients') { await listPatients(actor, res); return; }
    if (req.method === 'POST' && suffix === 'professional/patients') { await createPatient(await body(req), actor, res); return; }
    if (req.method === 'GET' && suffix === 'professional/devices') { await listDevices(actor, res); return; }
    if (req.method === 'GET' && /^professional\/patients\/[0-9a-f-]+\/sessions$/.test(suffix)) {
      await listSessions(actor, suffix.split('/')[2], url, res); return;
    }
    if (req.method === 'GET' && /^professional\/patients\/[0-9a-f-]+\/assignments$/.test(suffix)) {
      await listAssignments(actor, suffix.split('/')[2], res); return;
    }
    if (req.method === 'PUT' && /^professional\/assignments\/[0-9a-f-]+$/.test(suffix)) {
      await assignDevice(await body(req), actor, suffix.split('/')[2], res); return;
    }
    if (req.method === 'DELETE' && /^professional\/assignments\/[0-9a-f-]+$/.test(suffix)) {
      await revokeAssignment(actor, suffix.split('/')[2], res); return;
    }
    if (req.method === 'POST' && suffix === 'professional/families') { await createFamily(await body(req), actor, res); return; }
    if (req.method === 'GET' && /^professional\/patients\/[0-9a-f-]+\/family$/.test(suffix)) { await listPatientFamilies(actor, suffix.split('/')[2], res); return; }
    const patientFamilyAccess = suffix.split('/');
    if (patientFamilyAccess.length === 4 && patientFamilyAccess[0] === 'professional' && patientFamilyAccess[1] === 'patients' && validUuid(patientFamilyAccess[2]) && patientFamilyAccess[3] === 'family-access') {
      if (req.method === 'PUT') { await grantFamilyAccess(await body(req), actor, patientFamilyAccess[2], res); return; }
      if (req.method === 'DELETE') { await revokeFamilyAccess(await body(req), actor, patientFamilyAccess[2], res); return; }
    }
    if (req.method === 'GET' && suffix === 'admin/professionals') { await listProfessionals(actor, res); return; }
    if (req.method === 'GET' && suffix === 'admin/access') { await listAccess(actor, res); return; }
    const adminPatientAccess = suffix.split('/');
    if (adminPatientAccess.length === 4 && adminPatientAccess[0] === 'admin' && adminPatientAccess[1] === 'patients' && validUuid(adminPatientAccess[2]) && adminPatientAccess[3] === 'access') {
      if (req.method === 'PUT') { await grantPatientAccess(await body(req), actor, adminPatientAccess[2], res); return; }
      if (req.method === 'DELETE') { await revokePatientAccess(await body(req), actor, adminPatientAccess[2], res); return; }
    }
    if (req.method === 'POST' && suffix === 'admin/devices') { await createDevice(await body(req), actor, res); return; }
    if (req.method === 'POST' && /^admin\/devices\/[0-9a-f-]+\/rotate-token$/.test(suffix)) {
      await rotateDeviceToken(actor, suffix.split('/')[2], res); return;
    }
    if (req.method === 'POST' && suffix === 'admin/professionals') { await createProfessional(await body(req), actor, res); return; }
    if (req.method === 'PUT' && /^admin\/devices\/[0-9a-f-]+\/access$/.test(suffix)) {
      await grantDeviceAccess(await body(req), actor, suffix.split('/')[2], res); return;
    }
    if (req.method === 'DELETE' && /^admin\/devices\/[0-9a-f-]+\/access$/.test(suffix)) {
      await revokeDeviceAccess(await body(req), actor, suffix.split('/')[2], res); return;
    }
  }
  fail(res, 404, 'not_found', 'No se encontró esta ruta.');
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { headers(res); next(); });
app.use(express.json({ limit: MAX_BODY_BYTES, strict: true }));
// Portal anterior (HTML simple de Caro), disponible en /professional/ para tareas de administración.
app.use((req, res, next) => (req.method === 'GET' && req.originalUrl === '/professional') ? res.redirect(302, '/professional/') : next());
app.use('/professional', express.static(resolve(PUBLIC_DIR, 'professional'), { index: 'index.html', redirect: false, setHeaders(res) { res.setHeader('cache-control', 'no-store'); } }));
app.use(express.static(PUBLIC_DIR, {
  index: false,
  redirect: false,
  setHeaders(res) { res.setHeader('cache-control', 'no-store'); }
}));
// Portal (React): las rutas que no son archivos ni API devuelven index.html para que el navegador
// resuelva la pantalla (por ejemplo /pacientes/123). En Vercel lo hacen los rewrites de vercel.json.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/professional/') || !req.accepts('html')) return next();
  const index = resolve(PUBLIC_DIR, 'index.html');
  if (!existsSync(index)) return next();
  res.setHeader('cache-control', 'no-store');
  res.sendFile(index);
});
app.use((req, res, next) => {
  Promise.resolve(route(req, res)).catch((error) => {
    console.error('Kinima API request failed:', error.message);
    if (!res.headersSent) fail(res, error.status || 500, error.status ? 'request_error' : 'server_error', error.status ? error.message : 'Ocurrió un error interno.');
    else res.destroy();
  });
});
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status === 413 ? 413 : 400;
  fail(res, status, status === 413 ? 'payload_too_large' : 'invalid_json', status === 413 ? 'La solicitud supera el tamaño permitido.' : 'El JSON de la solicitud no es válido.');
});

export { app, pool, HOST, PORT };
export default app;
async function listProfessionals(actor, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede gestionar permisos.'); return; }
  const result = await pool.query('SELECT id,email,display_name,role FROM professionals WHERE active=TRUE ORDER BY display_name');
  json(res, 200, { professionals: result.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role })) });
}
async function grantPatientAccess(input, actor, patientId, res) {
  if (actor.role !== 'administrator') { fail(res, 403, 'forbidden', 'Solo una cuenta administradora puede compartir pacientes.'); return; }
  if (!validUuid(patientId) || !validUuid(input.professionalId)) { fail(res, 400, 'invalid_input', 'El identificador no es válido.'); return; }
  const result = await pool.query(`INSERT INTO professional_patient_access(professional_id,patient_id)
    SELECT p.id,pt.id FROM professionals p,patients pt WHERE p.id=$1 AND p.active=TRUE AND p.role='professional' AND pt.id=$2 AND pt.active=TRUE
    ON CONFLICT DO NOTHING RETURNING patient_id`, [input.professionalId, patientId]);
  if (!result.rowCount) {
    const existing = await pool.query(`SELECT 1 FROM professional_patient_access a
      JOIN professionals p ON p.id=a.professional_id AND p.active=TRUE AND p.role='professional'
      JOIN patients pt ON pt.id=a.patient_id AND pt.active=TRUE
      WHERE a.professional_id=$1 AND a.patient_id=$2`, [input.professionalId, patientId]);
    if (!existing.rowCount) { fail(res, 404, 'not_found', 'No se encontró la cuenta o el paciente.'); return; }
    json(res, 200, { granted: true });
    return;
  }
  await pool.query('INSERT INTO audit_events(id,actor_professional_id,action,subject_type,subject_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
    [randomUUID(), actor.id, 'patient.access.granted', 'patient', patientId, JSON.stringify({ professionalId: input.professionalId })]);
  json(res, 200, { granted: true });
}
