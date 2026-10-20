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
