-- Esquema del servidor central. Los pacientes se representan con códigos internos.

CREATE TABLE IF NOT EXISTS professionals (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('professional', 'administrator')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS professionals_email_lower_unique ON professionals (lower(email));

-- Dueñas de Kinima (no profesionales, no centro_admins): control total sobre todos los centros
-- clientes, sus cuentas de centro_admin y sus profesionales. Tabla separada a propósito, para que
-- un admin de un centro cliente nunca tenga este nivel de acceso.
CREATE TABLE IF NOT EXISTS kinima_owners (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS kinima_owners_email_lower_unique ON kinima_owners (lower(email));

-- Contacto interno de referencia en cada centro cliente (para uso de las dueñas de Kinima,
-- no se muestra a las familias; distinto del contacto público que sí ven en centros.email_contacto).
CREATE TABLE IF NOT EXISTS centro_contactos (
    id UUID PRIMARY KEY,
    centro_id UUID NOT NULL REFERENCES centros(id),
    nombre TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 100),
    cargo TEXT,
    telefono TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS centro_contactos_centro ON centro_contactos(centro_id);

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY,
    local_code TEXT NOT NULL UNIQUE,
    display_label TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES professionals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS professional_patient_access (
    professional_id UUID NOT NULL REFERENCES professionals(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (professional_id, patient_id)
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    device_code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    credential_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS professional_device_access (
    professional_id UUID NOT NULL REFERENCES professionals(id),
    device_id UUID NOT NULL REFERENCES devices(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (professional_id, device_id)
);

CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    version BIGINT NOT NULL CHECK (version > 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    exercise_config JSONB NOT NULL,
    assigned_by UUID NOT NULL REFERENCES professionals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (device_id, patient_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_assignment_per_device ON assignments(device_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS assignments_patient_created_at ON assignments(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    device_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    assignment_version BIGINT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 3600),
    elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds BETWEEN 1 AND 3600),
    hits INTEGER NOT NULL CHECK (hits >= 0),
    completed BOOLEAN NOT NULL,
    exercise_config JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (device_id, patient_id, assignment_version)
        REFERENCES assignments(device_id, patient_id, version)
);
CREATE INDEX IF NOT EXISTS sessions_patient_started_at ON sessions(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_device_received_at ON sessions(device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES professionals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS families_email_lower_unique ON families (lower(email));

CREATE TABLE IF NOT EXISTS family_patient_access (
    family_id UUID NOT NULL REFERENCES families(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (family_id, patient_id)
);
CREATE INDEX IF NOT EXISTS family_patient_access_patient ON family_patient_access(patient_id);

-- Centros (multi-tenant, como Moodle): cada centro tiene su propia info, noticias y eventos,
-- visibles solo para las familias de sus pacientes.
CREATE TABLE IF NOT EXISTS centros (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL,
    nombre TEXT NOT NULL,
    nombre_corto TEXT NOT NULL,
    tema TEXT NOT NULL DEFAULT 'teal' CHECK (tema IN ('teal', 'coral', 'amarillo', 'navy')),
    logo_url TEXT,
    ciudad TEXT,
    bienvenida TEXT,
    direccion TEXT,
    horarios TEXT,
    telefono TEXT,
    whatsapp TEXT,
    email_contacto TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS centros_slug_lower_unique ON centros (lower(slug));

-- Cuenta del centro (ej. la persona de redes/comunicación), separada de los profesionales:
-- solo puede administrar el contenido de SU centro (noticias, eventos, info), nunca pacientes ni rutinas.
CREATE TABLE IF NOT EXISTS centro_admins (
    id UUID PRIMARY KEY,
    centro_id UUID NOT NULL REFERENCES centros(id),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS centro_admins_email_lower_unique ON centro_admins (lower(email));

CREATE TABLE IF NOT EXISTS noticias (
    id UUID PRIMARY KEY,
    centro_id UUID NOT NULL REFERENCES centros(id),
    etiqueta TEXT NOT NULL DEFAULT 'Aviso' CHECK (etiqueta IN ('Aviso', 'Novedad', 'Comunidad', 'Bienvenida')),
    titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 140),
    cuerpo TEXT NOT NULL CHECK (char_length(cuerpo) BETWEEN 1 AND 4000),
    fijada BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES centro_admins(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS noticias_centro_created_at ON noticias(centro_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eventos (
    id UUID PRIMARY KEY,
    centro_id UUID NOT NULL REFERENCES centros(id),
    titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 140),
    lugar TEXT,
    detalle TEXT,
    fecha TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES centro_admins(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_centro_fecha ON eventos(centro_id, fecha);

-- Cada paciente pertenece a un centro. Se agrega como columna nullable (no todos los pacientes
-- existentes tienen uno todavía) y se rellena más abajo con el centro por defecto.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS centro_id UUID REFERENCES centros(id);

-- Primer arranque: si todavía no hay ningún centro, se crea uno por defecto y se le asignan
-- los pacientes que ya existían. Es idempotente: no hace nada si ya hay al menos un centro.
INSERT INTO centros (id, slug, nombre, nombre_corto, tema, bienvenida)
SELECT gen_random_uuid(), 'default', 'Mi centro', 'Centro', 'teal', 'Acá vas a encontrar la rutina de cada día, los mensajes de tu terapeuta y todo lo que pasa en el centro.'
WHERE NOT EXISTS (SELECT 1 FROM centros);

UPDATE patients SET centro_id = (SELECT id FROM centros ORDER BY created_at LIMIT 1) WHERE centro_id IS NULL;

-- Cada profesional (terapeuta) pertenece a un centro, igual que los pacientes. Nullable por los
-- mismos motivos: cuentas existentes de antes de este cambio no tienen uno todavía.
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS centro_id UUID REFERENCES centros(id);

-- Mensajes entre la familia y el equipo profesional, por paciente.
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('familia', 'profesional')),
    sender_family_id UUID REFERENCES families(id),
    sender_professional_id UUID REFERENCES professionals(id),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_patient_created_at ON messages(patient_id, created_at);
CREATE INDEX IF NOT EXISTS messages_patient_unread ON messages(patient_id, sender_type) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY,
    actor_professional_id UUID REFERENCES professionals(id),
    device_id UUID REFERENCES devices(id),
    action TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_occurred_at ON audit_events(occurred_at DESC);
