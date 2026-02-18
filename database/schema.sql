-- =============================================
-- SAARTHI FUND DATABASE SCHEMA
-- =============================================

-- ENUM Types
CREATE TYPE user_status AS ENUM ('pending', 'active', 'inactive', 'rejected');
CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE loan_status AS ENUM ('active', 'completed', 'defaulted');

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(15),
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'member',
    status user_status DEFAULT 'pending',
    
    -- Member's join date (month 1 starts from here)
    joined_at DATE,
    
    -- Admin who approved/rejected this user
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INTEREST RATE BRACKETS (Admin configurable)
-- =============================================
CREATE TABLE interest_brackets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    min_multiplier DECIMAL(4, 2) NOT NULL, -- e.g., 0, 2, 5, 7, 9
    max_multiplier DECIMAL(4, 2), -- NULL means no upper limit
    interest_rate DECIMAL(4, 2) NOT NULL, -- e.g., 9.5, 10, 10.5
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_range CHECK (min_multiplier >= 0 AND (max_multiplier IS NULL OR max_multiplier > min_multiplier))
);

-- Default brackets
INSERT INTO interest_brackets (min_multiplier, max_multiplier, interest_rate) VALUES
(0, 2, 9.5),
(2, 5, 10.0),
(5, 7, 10.5),
(7, 9, 11.0),
(9, 11, 11.5),
(11, NULL, 12.0);

-- =============================================
-- FUND SETTINGS (Admin configurable)
-- =============================================
CREATE TABLE fund_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default settings
INSERT INTO fund_settings (setting_key, setting_value, description) VALUES
('min_monthly_deposit', '300', 'Minimum monthly deposit amount'),
('deposit_multiple', '300', 'Deposits must be in multiples of this'),
('max_pool_percentage', '40', 'Max percentage of pool a member can borrow'),
('max_active_loans', '2', 'Maximum active loans per member'),
('loan_tenure_years', '3', 'Maximum loan tenure in years'),
('emi_start_after_years', '2', 'EMI must start after these many years');

-- =============================================
-- DEPOSITS TABLE
-- =============================================
CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    
    -- Member's relative month number (1, 2, 3, ...)
    member_month INT NOT NULL CHECK (member_month > 0),
    
    -- Actual calendar month for reference
    deposit_date DATE NOT NULL,
    
    -- Running total after this deposit (for quick lookups)
    cumulative_total DECIMAL(12, 2) NOT NULL,
    
    notes TEXT,
    recorded_by UUID REFERENCES users(id), -- Admin who recorded it
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- LOANS TABLE
-- =============================================
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Loan details
    principal_amount DECIMAL(12, 2) NOT NULL,
    interest_rate DECIMAL(4, 2) NOT NULL,
    multiplier_at_disbursement DECIMAL(6, 2) NOT NULL, -- e.g., 3.2x
    
    -- Snapshot at loan creation (for audit)
    user_total_deposits_at_loan DECIMAL(12, 2) NOT NULL,
    total_pool_at_loan DECIMAL(12, 2) NOT NULL,
    max_eligible_at_loan DECIMAL(12, 2) NOT NULL,
    
    -- Loan timeline
    disbursed_at DATE NOT NULL,
    emi_start_date DATE, -- NULL if not yet decided, can start anytime
    maturity_date DATE NOT NULL, -- Must be within 3 years of disbursement
    
    -- Pre-EMI interest tracking
    pre_emi_interest_amount DECIMAL(12, 2) DEFAULT 0, -- Total pre-EMI interest calculated
    
    -- Tracking
    outstanding_principal DECIMAL(12, 2) NOT NULL,
    total_interest_paid DECIMAL(12, 2) DEFAULT 0,
    status loan_status DEFAULT 'active',
    
    -- Which fund month's pool this loan was taken from (for interest distribution)
    pool_source_month INT,
    
    completed_at TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_timeline CHECK (
        maturity_date <= disbursed_at + INTERVAL '3 years' AND
        (emi_start_date IS NULL OR emi_start_date >= disbursed_at) AND
        (emi_start_date IS NULL OR maturity_date > emi_start_date)
    )
);

-- =============================================
-- PRE-EMI INTEREST TABLE (Interest before EMI starts)
-- =============================================
-- Interest formula: Principal × (1 + Rate/12) × (Days/30)
CREATE TABLE pre_emi_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    
    -- Period details
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    days_count INT NOT NULL,
    
    -- Calculation
    principal_amount DECIMAL(12, 2) NOT NULL,
    interest_rate DECIMAL(4, 2) NOT NULL,
    interest_amount DECIMAL(12, 2) NOT NULL,
    
    -- Payment tracking
    due_date DATE NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    paid_amount DECIMAL(12, 2),
    paid_at DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- EMI SCHEDULE TABLE (Year 3 EMIs)
-- =============================================
CREATE TABLE emi_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    
    emi_number INT NOT NULL,
    due_date DATE NOT NULL,
    
    -- Calculated at schedule creation
    principal_component DECIMAL(12, 2) NOT NULL,
    interest_component DECIMAL(12, 2) NOT NULL,
    total_emi DECIMAL(12, 2) NOT NULL,
    outstanding_after DECIMAL(12, 2) NOT NULL,
    
    -- Payment tracking
    is_paid BOOLEAN DEFAULT FALSE,
    paid_amount DECIMAL(12, 2),
    paid_at DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(loan_id, emi_number)
);

-- =============================================
-- PAYMENTS TABLE (All payments - interest & EMI)
-- =============================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    user_id UUID NOT NULL REFERENCES users(id),
    
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    principal_component DECIMAL(12, 2) DEFAULT 0,
    interest_component DECIMAL(12, 2) DEFAULT 0,
    
    payment_type VARCHAR(20) NOT NULL, -- 'annual_interest', 'emi', 'prepayment'
    payment_date DATE NOT NULL,
    
    -- Link to specific schedule entry if applicable
    pre_emi_interest_id UUID REFERENCES pre_emi_interest(id),
    emi_schedule_id UUID REFERENCES emi_schedule(id),
    
    notes TEXT,
    recorded_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =============================================
-- MONTHLY POOL SNAPSHOT (Freeze pool composition each month)
-- =============================================
CREATE TABLE monthly_pool_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Fund month (1, 2, 3... from fund start)
    fund_month INT NOT NULL UNIQUE,
    month_year VARCHAR(7) NOT NULL, -- 'YYYY-MM' format for reference
    
    -- Pool totals at end of this month
    total_pool_amount DECIMAL(12, 2) NOT NULL,
    total_pool_units INT NOT NULL, -- Total units (amount / 300)
    cumulative_pool_units INT NOT NULL, -- Sum of all units up to this month
    
    -- Snapshot of each member's cumulative units (stored as JSONB)
    -- Format: { "user_id": cumulative_units, ... }
    member_snapshots JSONB NOT NULL,
    
    is_finalized BOOLEAN DEFAULT FALSE, -- Lock after month ends
    finalized_at TIMESTAMP,
    finalized_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- MONTHLY INTEREST ENTRIES (Interest earned each month)
-- =============================================
CREATE TYPE interest_source AS ENUM ('loan_interest', 'bank_interest', 'other');

CREATE TABLE monthly_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Which month this interest was EARNED in
    earned_month INT NOT NULL, -- Fund month when interest was received
    
    -- Source of interest
    source interest_source NOT NULL,
    source_description TEXT, -- e.g., "FD 5000rs", "Loan for 45 days"
    
    -- For loan interest: which loan and which month's pool it came from
    loan_id UUID REFERENCES loans(id),
    pool_source_month INT, -- The fund month whose pool funded this loan
    
    -- Amount
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    
    -- Admin who recorded this
    recorded_by UUID REFERENCES users(id),
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- MEMBER INTEREST SHARES (Each member's share of interest)
-- =============================================
CREATE TABLE member_interest_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES users(id),
    monthly_interest_id UUID NOT NULL REFERENCES monthly_interest(id),
    
    -- Calculation details
    member_cumulative_units INT NOT NULL, -- Member's units at pool_source_month
    total_pool_units INT NOT NULL, -- Total pool units at pool_source_month
    share_percentage DECIMAL(8, 4) NOT NULL, -- member_units / total_units * 100
    
    -- Calculated share
    interest_share DECIMAL(12, 2) NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, monthly_interest_id)
);

-- =============================================
-- EMERGENCY FUND (Pool's accumulated interest)
-- =============================================
CREATE TABLE emergency_fund (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Running balance
    total_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    
    -- Last updated
    last_interest_month INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize emergency fund
INSERT INTO emergency_fund (total_balance, last_interest_month) VALUES (0, 0);

-- =============================================
-- EMERGENCY FUND TRANSACTIONS (Track all movements)
-- =============================================
CREATE TYPE ef_transaction_type AS ENUM ('interest_credit', 'loan_disbursement', 'loan_repayment', 'adjustment');

CREATE TABLE emergency_fund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    transaction_type ef_transaction_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL, -- Positive for credit, negative for debit
    
    -- Reference to source
    monthly_interest_id UUID REFERENCES monthly_interest(id),
    loan_id UUID REFERENCES loans(id),
    
    -- Balance after this transaction
    balance_after DECIMAL(12, 2) NOT NULL,
    
    description TEXT,
    recorded_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- VIEWS
-- =============================================

-- Fund overview
CREATE VIEW v_fund_summary AS
SELECT 
    COALESCE(SUM(d.amount), 0) AS total_pool,
    COALESCE((SELECT SUM(outstanding_principal) FROM loans WHERE status = 'active'), 0) AS total_loaned_out,
    COALESCE(SUM(d.amount), 0) - COALESCE((SELECT SUM(outstanding_principal) FROM loans WHERE status = 'active'), 0) AS available_balance,
    (SELECT COUNT(*) FROM users WHERE status = 'active' AND role = 'member') AS active_members,
    (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending_approvals
FROM deposits d
JOIN users u ON d.user_id = u.id
WHERE u.status = 'active';

-- Member summary with eligibility
CREATE VIEW v_member_summary AS
SELECT 
    u.id,
    u.name,
    u.email,
    u.status,
    u.joined_at,
    COALESCE(d.total_deposits, 0) AS total_deposits,
    COALESCE(d.current_month, 0) AS months_active,
    COALESCE(l.active_loan_count, 0) AS active_loans,
    COALESCE(l.total_outstanding, 0) AS total_outstanding,
    -- Eligibility calculation
    LEAST(
        (SELECT COALESCE(SUM(amount), 0) FROM deposits) * 0.40,
        COALESCE(d.total_deposits, 0) * 11 -- Max multiplier from brackets
    ) - COALESCE(l.total_outstanding, 0) AS remaining_eligibility
FROM users u
LEFT JOIN (
    SELECT user_id, SUM(amount) AS total_deposits, MAX(member_month) AS current_month
    FROM deposits GROUP BY user_id
) d ON u.id = d.user_id
LEFT JOIN (
    SELECT user_id, COUNT(*) AS active_loan_count, SUM(outstanding_principal) AS total_outstanding
    FROM loans WHERE status = 'active' GROUP BY user_id
) l ON u.id = l.user_id
WHERE u.role = 'member';

-- Loan details with payment status
CREATE VIEW v_loan_details AS
SELECT 
    l.*,
    u.name AS borrower_name,
    u.email AS borrower_email,
    COALESCE(pei.total_pre_emi_interest, 0) AS total_pre_emi_interest_due,
    COALESCE(pei.paid_pre_emi_interest, 0) AS total_pre_emi_interest_paid,
    COALESCE(e.total_emis, 0) AS total_emi_count,
    COALESCE(e.paid_emis, 0) AS paid_emi_count
FROM loans l
JOIN users u ON l.user_id = u.id
LEFT JOIN (
    SELECT loan_id, 
           SUM(interest_amount) AS total_pre_emi_interest,
           SUM(CASE WHEN is_paid THEN paid_amount ELSE 0 END) AS paid_pre_emi_interest
    FROM pre_emi_interest GROUP BY loan_id
) pei ON l.id = pei.loan_id
LEFT JOIN (
    SELECT loan_id, COUNT(*) AS total_emis, SUM(CASE WHEN is_paid THEN 1 ELSE 0 END) AS paid_emis
    FROM emi_schedule GROUP BY loan_id
) e ON l.id = e.loan_id;

-- Pending payments (upcoming dues)
CREATE VIEW v_pending_payments AS
SELECT 
    'pre_emi_interest' AS payment_type,
    pei.id AS schedule_id,
    l.id AS loan_id,
    u.id AS user_id,
    u.name AS user_name,
    pei.interest_amount AS amount_due,
    pei.due_date,
    pei.days_count AS period
FROM pre_emi_interest pei
JOIN loans l ON pei.loan_id = l.id
JOIN users u ON l.user_id = u.id
WHERE pei.is_paid = FALSE AND l.status = 'active'

UNION ALL

SELECT 
    'emi' AS payment_type,
    es.id AS schedule_id,
    l.id AS loan_id,
    u.id AS user_id,
    u.name AS user_name,
    es.total_emi AS amount_due,
    es.due_date,
    es.emi_number AS period
FROM emi_schedule es
JOIN loans l ON es.loan_id = l.id
JOIN users u ON l.user_id = u.id
WHERE es.is_paid = FALSE AND l.status = 'active'
ORDER BY due_date;

-- Member's total interest earned
CREATE VIEW v_member_interest_summary AS
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
CREATE VIEW v_monthly_interest_summary AS
SELECT 
    mi.earned_month,
    mi.source,
    SUM(mi.amount) AS total_interest,
    COUNT(*) AS entry_count
FROM monthly_interest mi
GROUP BY mi.earned_month, mi.source
ORDER BY mi.earned_month DESC, mi.source;

-- Emergency fund status
CREATE VIEW v_emergency_fund_status AS
SELECT 
    ef.total_balance,
    ef.last_interest_month,
    ef.updated_at,
    (SELECT COALESCE(SUM(amount), 0) FROM monthly_interest) AS total_interest_earned,
    (SELECT COUNT(*) FROM emergency_fund_transactions WHERE transaction_type = 'loan_disbursement') AS emergency_loans_given
FROM emergency_fund ef
LIMIT 1;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_member_month ON deposits(user_id, member_month);
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_pre_emi_interest_loan_id ON pre_emi_interest(loan_id);
CREATE INDEX idx_pre_emi_interest_due_date ON pre_emi_interest(due_date);
CREATE INDEX idx_emi_schedule_loan_id ON emi_schedule(loan_id);
CREATE INDEX idx_emi_schedule_due_date ON emi_schedule(due_date);
CREATE INDEX idx_payments_loan_id ON payments(loan_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_monthly_pool_snapshot_fund_month ON monthly_pool_snapshot(fund_month);
CREATE INDEX idx_monthly_interest_earned_month ON monthly_interest(earned_month);
CREATE INDEX idx_monthly_interest_loan_id ON monthly_interest(loan_id);
CREATE INDEX idx_monthly_interest_pool_source ON monthly_interest(pool_source_month);
CREATE INDEX idx_member_interest_shares_user_id ON member_interest_shares(user_id);
CREATE INDEX idx_member_interest_shares_interest_id ON member_interest_shares(monthly_interest_id);
CREATE INDEX idx_ef_transactions_type ON emergency_fund_transactions(transaction_type);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Function: Get interest rate for a given multiplier
CREATE OR REPLACE FUNCTION get_interest_rate(p_multiplier DECIMAL)
RETURNS DECIMAL AS $$
DECLARE
    v_rate DECIMAL;
BEGIN
    SELECT interest_rate INTO v_rate
    FROM interest_brackets
    WHERE is_active = TRUE
      AND p_multiplier > min_multiplier
      AND (max_multiplier IS NULL OR p_multiplier <= max_multiplier)
    LIMIT 1;
    
    RETURN COALESCE(v_rate, 12.0); -- Default to highest if not found
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate pre-EMI total amount (compound interest)
-- Formula: Principal × (1 + Rate/12)^(Days/30)
-- Returns TOTAL amount to repay (principal + interest)
CREATE OR REPLACE FUNCTION calculate_pre_emi_total(
    p_principal DECIMAL,
    p_rate DECIMAL,  -- Annual rate as percentage (e.g., 9.5 for 9.5%)
    p_days INT
)
RETURNS DECIMAL AS $$
BEGIN
    RETURN p_principal * POWER(1 + (p_rate / 100) / 12, p_days::DECIMAL / 30);
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate pre-EMI interest only
CREATE OR REPLACE FUNCTION calculate_pre_emi_interest(
    p_principal DECIMAL,
    p_rate DECIMAL,
    p_days INT
)
RETURNS DECIMAL AS $$
BEGIN
    RETURN calculate_pre_emi_total(p_principal, p_rate, p_days) - p_principal;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate member's max eligibility
CREATE OR REPLACE FUNCTION get_member_eligibility(p_user_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_user_deposits DECIMAL;
    v_total_pool DECIMAL;
    v_outstanding DECIMAL;
    v_max_eligible DECIMAL;
BEGIN
    -- Get user's total deposits
    SELECT COALESCE(SUM(amount), 0) INTO v_user_deposits
    FROM deposits WHERE user_id = p_user_id;
    
    -- Get total pool
    SELECT COALESCE(SUM(amount), 0) INTO v_total_pool FROM deposits;
    
    -- Get user's outstanding loans
    SELECT COALESCE(SUM(outstanding_principal), 0) INTO v_outstanding
    FROM loans WHERE user_id = p_user_id AND status = 'active';
    
    -- Max eligible = min(40% of pool, unlimited multiplier) - outstanding
    -- Since multiplier is unlimited, 40% of pool is the effective cap
    v_max_eligible := (v_total_pool * 0.40) - v_outstanding;
    
    RETURN GREATEST(v_max_eligible, 0);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Enforce max 2 active loans per user
CREATE OR REPLACE FUNCTION check_active_loans_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_loans INT;
BEGIN
    SELECT setting_value::INT INTO v_max_loans
    FROM fund_settings WHERE setting_key = 'max_active_loans';
    
    IF (SELECT COUNT(*) FROM loans WHERE user_id = NEW.user_id AND status = 'active') >= v_max_loans THEN
        RAISE EXCEPTION 'User already has maximum allowed active loans';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_loan_limit
    BEFORE INSERT ON loans
    FOR EACH ROW
    EXECUTE FUNCTION check_active_loans_limit();

-- Trigger: Validate deposit amount (multiple of 300)
CREATE OR REPLACE FUNCTION validate_deposit()
RETURNS TRIGGER AS $$
DECLARE
    v_multiple INT;
BEGIN
    SELECT setting_value::INT INTO v_multiple
    FROM fund_settings WHERE setting_key = 'deposit_multiple';
    
    IF MOD(NEW.amount::INT, v_multiple) != 0 THEN
        RAISE EXCEPTION 'Deposit must be in multiples of %', v_multiple;
    END IF;
    
    -- Calculate cumulative total
    SELECT COALESCE(SUM(amount), 0) + NEW.amount INTO NEW.cumulative_total
    FROM deposits WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_deposit
    BEFORE INSERT ON deposits
    FOR EACH ROW
    EXECUTE FUNCTION validate_deposit();

-- Trigger: Validate minimum deposit for member's month
CREATE OR REPLACE FUNCTION validate_minimum_deposit()
RETURNS TRIGGER AS $$
DECLARE
    v_min_deposit INT;
    v_required_total DECIMAL;
    v_current_total DECIMAL;
BEGIN
    SELECT setting_value::INT INTO v_min_deposit
    FROM fund_settings WHERE setting_key = 'min_monthly_deposit';
    
    -- Required total by this month = 300 * member_month
    v_required_total := v_min_deposit * NEW.member_month;
    
    -- Current total after this deposit
    SELECT COALESCE(SUM(amount), 0) INTO v_current_total
    FROM deposits WHERE user_id = NEW.user_id;
    
    v_current_total := v_current_total + NEW.amount;
    
    IF v_current_total < v_required_total THEN
        RAISE EXCEPTION 'Total deposits (%) must be at least % for month %', 
            v_current_total, v_required_total, NEW.member_month;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_minimum_deposit
    BEFORE INSERT ON deposits
    FOR EACH ROW
    EXECUTE FUNCTION validate_minimum_deposit();

-- Trigger: Update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_users_timestamp
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_loans_timestamp
    BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger: Update loan status when fully paid
CREATE OR REPLACE FUNCTION check_loan_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the loan's outstanding principal
    UPDATE loans 
    SET outstanding_principal = outstanding_principal - NEW.principal_component,
        total_interest_paid = total_interest_paid + NEW.interest_component
    WHERE id = NEW.loan_id;
    
    -- Check if loan is fully paid
    IF (SELECT outstanding_principal FROM loans WHERE id = NEW.loan_id) <= 0 THEN
        UPDATE loans 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = NEW.loan_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_loan_completion
    AFTER INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION check_loan_completion();

-- =============================================
-- INTEREST DISTRIBUTION FUNCTIONS
-- =============================================

-- Function: Create monthly pool snapshot
CREATE OR REPLACE FUNCTION create_monthly_snapshot(
    p_fund_month INT,
    p_month_year VARCHAR(7),
    p_admin_id UUID
)
RETURNS UUID AS $
DECLARE
    v_snapshot_id UUID;
    v_total_amount DECIMAL;
    v_total_units INT;
    v_cumulative_units INT;
    v_member_data JSONB;
BEGIN
    -- Check if snapshot already exists
    IF EXISTS (SELECT 1 FROM monthly_pool_snapshot WHERE fund_month = p_fund_month) THEN
        RAISE EXCEPTION 'Snapshot for month % already exists', p_fund_month;
    END IF;
    
    -- Calculate total pool
    SELECT COALESCE(SUM(amount), 0) INTO v_total_amount FROM deposits;
    v_total_units := (v_total_amount / 300)::INT;
    
    -- Calculate cumulative units (sum of all months' units)
    -- For simplicity, cumulative = total units at this point
    v_cumulative_units := v_total_units;
    
    -- Build member snapshots
    SELECT COALESCE(jsonb_object_agg(user_id::TEXT, cumulative_units), '{}'::JSONB)
    INTO v_member_data
    FROM (
        SELECT user_id, (SUM(amount) / 300)::INT AS cumulative_units
        FROM deposits
        GROUP BY user_id
    ) sub;
    
    -- Insert snapshot
    INSERT INTO monthly_pool_snapshot (
        fund_month, month_year, total_pool_amount, total_pool_units,
        cumulative_pool_units, member_snapshots, is_finalized, finalized_at, finalized_by
    ) VALUES (
        p_fund_month, p_month_year, v_total_amount, v_total_units,
        v_cumulative_units, v_member_data, TRUE, CURRENT_TIMESTAMP, p_admin_id
    ) RETURNING id INTO v_snapshot_id;
    
    RETURN v_snapshot_id;
END;
$ LANGUAGE plpgsql;

-- Function: Distribute interest to members
CREATE OR REPLACE FUNCTION distribute_interest(
    p_monthly_interest_id UUID
)
RETURNS INT AS $
DECLARE
    v_interest RECORD;
    v_snapshot RECORD;
    v_member RECORD;
    v_share_count INT := 0;
    v_rate_per_unit DECIMAL;
BEGIN
    -- Get interest entry
    SELECT * INTO v_interest FROM monthly_interest WHERE id = p_monthly_interest_id;
    
    IF v_interest IS NULL THEN
        RAISE EXCEPTION 'Interest entry not found';
    END IF;
    
    -- Get the pool snapshot for the source month
    SELECT * INTO v_snapshot 
    FROM monthly_pool_snapshot 
    WHERE fund_month = COALESCE(v_interest.pool_source_month, v_interest.earned_month);
    
    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'Pool snapshot not found for month %', 
            COALESCE(v_interest.pool_source_month, v_interest.earned_month);
    END IF;
    
    -- Calculate rate per unit
    IF v_snapshot.cumulative_pool_units = 0 THEN
        RAISE EXCEPTION 'Pool has zero units';
    END IF;
    
    v_rate_per_unit := v_interest.amount / v_snapshot.cumulative_pool_units;
    
    -- Distribute to each member based on their snapshot
    FOR v_member IN 
        SELECT key::UUID AS user_id, value::INT AS units
        FROM jsonb_each_text(v_snapshot.member_snapshots)
    LOOP
        INSERT INTO member_interest_shares (
            user_id, monthly_interest_id, member_cumulative_units,
            total_pool_units, share_percentage, interest_share
        ) VALUES (
            v_member.user_id,
            p_monthly_interest_id,
            v_member.units,
            v_snapshot.cumulative_pool_units,
            (v_member.units::DECIMAL / v_snapshot.cumulative_pool_units) * 100,
            v_rate_per_unit * v_member.units
        );
        v_share_count := v_share_count + 1;
    END LOOP;
    
    -- Update emergency fund
    UPDATE emergency_fund 
    SET total_balance = total_balance + v_interest.amount,
        last_interest_month = GREATEST(last_interest_month, v_interest.earned_month),
        updated_at = CURRENT_TIMESTAMP;
    
    -- Record transaction
    INSERT INTO emergency_fund_transactions (
        transaction_type, amount, monthly_interest_id, balance_after, description
    ) VALUES (
        'interest_credit',
        v_interest.amount,
        p_monthly_interest_id,
        (SELECT total_balance FROM emergency_fund),
        v_interest.source_description
    );
    
    RETURN v_share_count;
END;
$ LANGUAGE plpgsql;

-- Function: Add interest and distribute in one call
CREATE OR REPLACE FUNCTION add_and_distribute_interest(
    p_earned_month INT,
    p_source interest_source,
    p_amount DECIMAL,
    p_description TEXT,
    p_loan_id UUID DEFAULT NULL,
    p_pool_source_month INT DEFAULT NULL,
    p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE(interest_id UUID, members_distributed INT) AS $
DECLARE
    v_interest_id UUID;
    v_count INT;
BEGIN
    -- Insert interest entry
    INSERT INTO monthly_interest (
        earned_month, source, source_description, loan_id, 
        pool_source_month, amount, recorded_by
    ) VALUES (
        p_earned_month, p_source, p_description, p_loan_id,
        COALESCE(p_pool_source_month, p_earned_month), p_amount, p_admin_id
    ) RETURNING id INTO v_interest_id;
    
    -- Distribute to members
    SELECT distribute_interest(v_interest_id) INTO v_count;
    
    RETURN QUERY SELECT v_interest_id, v_count;
END;
$ LANGUAGE plpgsql;
