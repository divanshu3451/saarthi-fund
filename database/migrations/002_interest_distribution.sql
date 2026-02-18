-- =============================================
-- MIGRATION: Interest Distribution System
-- Run this after the initial schema is set up
-- =============================================

-- Add pool_source_month to loans table
ALTER TABLE loans ADD COLUMN IF NOT EXISTS pool_source_month INT;

-- Create ENUM types
DO $$ BEGIN
    CREATE TYPE interest_source AS ENUM ('loan_interest', 'bank_interest', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ef_transaction_type AS ENUM ('interest_credit', 'loan_disbursement', 'loan_repayment', 'adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- MONTHLY POOL SNAPSHOT
-- =============================================
CREATE TABLE IF NOT EXISTS monthly_pool_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_month INT NOT NULL UNIQUE,
    month_year VARCHAR(7) NOT NULL,
    total_pool_amount DECIMAL(12, 2) NOT NULL,
    total_pool_units INT NOT NULL,
    cumulative_pool_units INT NOT NULL,
    member_snapshots JSONB NOT NULL,
    is_finalized BOOLEAN DEFAULT FALSE,
    finalized_at TIMESTAMP,
    finalized_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_monthly_pool_snapshot_fund_month ON monthly_pool_snapshot(fund_month);

-- =============================================
-- MONTHLY INTEREST
-- =============================================
CREATE TABLE IF NOT EXISTS monthly_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    earned_month INT NOT NULL,
    source interest_source NOT NULL,
    source_description TEXT,
    loan_id UUID REFERENCES loans(id),
    pool_source_month INT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    recorded_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_monthly_interest_earned_month ON monthly_interest(earned_month);
CREATE INDEX IF NOT EXISTS idx_monthly_interest_loan_id ON monthly_interest(loan_id);
CREATE INDEX IF NOT EXISTS idx_monthly_interest_pool_source ON monthly_interest(pool_source_month);

-- =============================================
-- MEMBER INTEREST SHARES
-- =============================================
CREATE TABLE IF NOT EXISTS member_interest_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    monthly_interest_id UUID NOT NULL REFERENCES monthly_interest(id),
    member_cumulative_units INT NOT NULL,
    total_pool_units INT NOT NULL,
    share_percentage DECIMAL(8, 4) NOT NULL,
    interest_share DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, monthly_interest_id)
);

CREATE INDEX IF NOT EXISTS idx_member_interest_shares_user_id ON member_interest_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_member_interest_shares_interest_id ON member_interest_shares(monthly_interest_id);

-- =============================================
-- EMERGENCY FUND
-- =============================================
CREATE TABLE IF NOT EXISTS emergency_fund (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    last_interest_month INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize emergency fund if empty
INSERT INTO emergency_fund (total_balance, last_interest_month)
SELECT 0, 0
WHERE NOT EXISTS (SELECT 1 FROM emergency_fund);

-- =============================================
-- EMERGENCY FUND TRANSACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS emergency_fund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type ef_transaction_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    monthly_interest_id UUID REFERENCES monthly_interest(id),
    loan_id UUID REFERENCES loans(id),
    balance_after DECIMAL(12, 2) NOT NULL,
    description TEXT,
    recorded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ef_transactions_type ON emergency_fund_transactions(transaction_type);

-- =============================================
-- VIEWS
-- =============================================

-- Member's total interest earned
CREATE OR REPLACE VIEW v_member_interest_summary AS
SELECT 
    u.id AS user_id,
    u.name,
    COALESCE(SUM(mis.interest_share), 0) AS total_interest_earned,
    COUNT(DISTINCT mis.monthly_interest_id) AS interest_entries
FROM users u
LEFT JOIN member_interest_shares mis ON u.id = mis.user_id
WHERE u.role = 'member'
GROUP BY u.id, u.name;

-- Monthly interest breakdown
CREATE OR REPLACE VIEW v_monthly_interest_summary AS
SELECT 
    mi.earned_month,
    mi.source,
    SUM(mi.amount) AS total_interest,
    COUNT(*) AS entry_count
FROM monthly_interest mi
GROUP BY mi.earned_month, mi.source
ORDER BY mi.earned_month DESC, mi.source;

-- Emergency fund status
CREATE OR REPLACE VIEW v_emergency_fund_status AS
SELECT 
    ef.total_balance,
    ef.last_interest_month,
    ef.updated_at,
    (SELECT COALESCE(SUM(amount), 0) FROM monthly_interest) AS total_interest_earned,
    (SELECT COUNT(*) FROM emergency_fund_transactions WHERE transaction_type = 'loan_disbursement') AS emergency_loans_given
FROM emergency_fund ef
LIMIT 1;

-- =============================================
-- DONE
-- =============================================
SELECT 'Interest distribution tables created successfully!' AS status;
