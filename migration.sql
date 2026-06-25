-- Migration query for apis table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS apis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(255),
    status_code INTEGER NOT NULL,
    response JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
