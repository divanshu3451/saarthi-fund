# Saarthi Fund - Database Schema Documentation

## Overview

This document explains each table, their relationships, and provides examples with edge cases.

---

## 1. USERS Table

**Purpose:** Store all members and admins with approval workflow.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | VARCHAR | Full name |
| email | VARCHAR | Unique email for login |
| phone | VARCHAR | Contact number |
| password_hash | VARCHAR | Encrypted password |
| role | ENUM | 'admin' or 'member' |
| status | ENUM | 'pending', 'active', 'inactive', 'rejected' |
| joined_at | DATE | When member was approved (Month 1 starts here) |
| approved_by | UUID | Admin who approved this user |
| approved_at | TIMESTAMP | When approved |
| rejection_reason | TEXT | Why rejected (if applicable) |

**Workflow:**
```
User registers → status = 'pending'
Admin approves → status = 'active', joined_at = today
Admin rejects → status = 'rejected', rejection_reason = "..."
Admin deactivates → status = 'inactive'
```

**Example:**
```sql
-- Ravi registers on Jan 15, 2026
INSERT INTO users (name, email, password_hash, status)
VALUES ('Ravi Kumar', 'ravi@email.com', 'hashed_pwd', 'pending');

-- Admin Amit approves on Jan 20, 2026
UPDATE users SET 
    status = 'active',
    joined_at = '2026-01-20',
    approved_by = 'amit-uuid',
    approved_at = NOW()
WHERE email = 'ravi@email.com';
```

**Edge Cases:**
- User tries to login while `status = 'pending'` → Block login
- Admin cannot be deleted if they approved other users (foreign key)

---

## 2. INTEREST_BRACKETS Table

**Purpose:** Admin-configurable interest rate slabs based on loan multiplier.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| min_multiplier | DECIMAL | Lower bound (exclusive) |
| max_multiplier | DECIMAL | Upper bound (inclusive), NULL = no limit |
| interest_rate | DECIMAL | Annual interest rate % |
| is_active | BOOLEAN | Can disable old brackets |

**Rate Lookup Logic:**
```
multiplier > min_multiplier AND multiplier <= max_multiplier
```

**Default Brackets:**
| Range | Rate |
|-------|------|
| (0, 2] | 9.5% |
| (2, 5] | 10.0% |
| (5, 7] | 10.5% |
| (7, 9] | 11.0% |
| (9, 11] | 11.5% |
| (11, ∞) | 12.0% |

**Examples:**
```
User deposits: ₹1,000
Loan amount: ₹2,000
Multiplier: 2000/1000 = 2x
Rate: Falls in (0, 2] → 9.5%

User deposits: ₹1,000
Loan amount: ₹2,100
Multiplier: 2100/1000 = 2.1x
Rate: Falls in (2, 5] → 10.0%
```

**Edge Cases:**
- Exactly 2x → 9.5% (upper bound is inclusive)
- Exactly 2.0001x → 10% (crossed into next bracket)
- Admin adds new bracket (11, 13, 12.0) → Old NULL bracket should be updated


---

## 3. FUND_SETTINGS Table

**Purpose:** Store configurable parameters that admin can change without code deployment.

**Default Settings:**
| Key | Value | Used For |
|-----|-------|----------|
| min_monthly_deposit | 300 | Minimum deposit per month |
| deposit_multiple | 300 | Deposits must be 300, 600, 900... |
| max_pool_percentage | 40 | Max 40% of pool can be borrowed |
| max_active_loans | 2 | Max concurrent loans per member |
| loan_tenure_years | 3 | Loan must be repaid within 3 years |
| emi_start_after_years | 2 | EMI starts after 2 years |

**Usage Example:**
```sql
-- Check if user can take another loan
SELECT setting_value FROM fund_settings WHERE setting_key = 'max_active_loans';
-- Returns: 2

-- Admin wants to allow 3 loans now
UPDATE fund_settings SET setting_value = '3' WHERE setting_key = 'max_active_loans';
```

---

## 4. DEPOSITS Table

**Purpose:** Track all deposits with member-relative month tracking.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| user_id | UUID | Who deposited |
| amount | DECIMAL | Deposit amount (multiple of 300) |
| member_month | INT | Member's relative month (1, 2, 3...) |
| deposit_date | DATE | Actual calendar date |
| cumulative_total | DECIMAL | Running total (auto-calculated) |
| recorded_by | UUID | Admin who recorded (if cash deposit) |

**Key Concept - Member Month:**
Each member's "Month 1" starts from their `joined_at` date.

**Example Scenario:**
```
Fund starts: Jan 2026
- Amit joins Jan 2026 → His Month 1 = Jan 2026
- Ravi joins Mar 2026 → His Month 1 = Mar 2026

By June 2026:
- Amit is in his Month 6 (must have deposited 6 × 300 = ₹1,800 minimum)
- Ravi is in his Month 4 (must have deposited 4 × 300 = ₹1,200 minimum)
```

**Deposit Validation Rules:**
1. Amount must be multiple of 300
2. By month N, total deposits must be ≥ 300 × N

**Example - Valid Deposits:**
```sql
-- Ravi joins March 2026, deposits regularly
-- Month 1 (Mar): ₹300 → Total: ₹300 ✓ (need ≥ 300)
-- Month 2 (Apr): ₹300 → Total: ₹600 ✓ (need ≥ 600)
-- Month 3 (May): ₹600 → Total: ₹1,200 ✓ (need ≥ 900)
-- Month 4 (Jun): ₹300 → Total: ₹1,500 ✓ (need ≥ 1,200)
```

**Example - Catching Up:**
```sql
-- Ravi misses Month 2 and 3, deposits in Month 4
-- Month 1: ₹300 → Total: ₹300
-- Month 4: Needs to deposit at least ₹900 to reach ₹1,200 (300 × 4)

INSERT INTO deposits (user_id, amount, member_month, deposit_date)
VALUES ('ravi-uuid', 900, 4, '2026-06-15');
-- cumulative_total auto-calculated as 1,200 ✓
```

**Edge Cases:**
- Deposit ₹500 → Rejected (not multiple of 300)
- Month 4 deposit of ₹600 when total is ₹300 → Rejected (300+600=900 < 1200 required)

---

## 5. LOANS Table

**Purpose:** Track all loans with eligibility snapshot and timeline.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| user_id | UUID | Borrower |
| principal_amount | DECIMAL | Loan amount |
| interest_rate | DECIMAL | Locked rate at disbursement |
| multiplier_at_disbursement | DECIMAL | e.g., 3.2x |
| user_total_deposits_at_loan | DECIMAL | User's deposits when loan taken |
| total_pool_at_loan | DECIMAL | Total fund pool when loan taken |
| max_eligible_at_loan | DECIMAL | Max they could borrow |
| disbursed_at | DATE | When loan was given |
| emi_start_date | DATE | When EMIs begin (within 2 years) |
| maturity_date | DATE | Final repayment date (within 3 years) |
| outstanding_principal | DECIMAL | Remaining principal |
| total_interest_paid | DECIMAL | Interest paid so far |
| status | ENUM | 'active', 'completed', 'defaulted' |

**Eligibility Calculation:**
```
max_eligible = min(40% of total_pool, unlimited multiplier) - existing_outstanding

Since multiplier is unlimited, effective cap = 40% of pool
```

**Example - First Loan:**
```
Fund Status:
- Total pool: ₹50,000
- Ravi's deposits: ₹3,000
- Ravi's outstanding: ₹0

Ravi wants ₹10,000 loan:
- 40% of pool = ₹20,000
- Max eligible = ₹20,000 - ₹0 = ₹20,000
- ₹10,000 < ₹20,000 ✓ Approved

Multiplier = 10,000 / 3,000 = 3.33x
Interest rate = (2, 5] bracket = 10%
```

```sql
INSERT INTO loans (
    user_id, principal_amount, interest_rate, multiplier_at_disbursement,
    user_total_deposits_at_loan, total_pool_at_loan, max_eligible_at_loan,
    disbursed_at, emi_start_date, maturity_date, outstanding_principal
) VALUES (
    'ravi-uuid', 10000, 10.0, 3.33,
    3000, 50000, 20000,
    '2026-06-01', '2028-06-01', '2029-06-01', 10000
);
```

**Example - Second Loan:**
```
After first loan:
- Ravi's outstanding: ₹10,000
- Pool still: ₹50,000

Ravi wants another ₹8,000:
- Max eligible = ₹20,000 - ₹10,000 = ₹10,000
- ₹8,000 < ₹10,000 ✓ Approved
```

**Timeline Constraints:**
```
Loan taken: June 1, 2026
EMI must start by: June 1, 2028 (within 2 years)
Must be fully repaid by: June 1, 2029 (within 3 years)
```

**Edge Cases:**
- User requests 3rd loan → Trigger blocks it (max 2 active)
- User requests more than remaining eligibility → Application layer rejects
- EMI start date > disbursed_at + 2 years → CHECK constraint fails

---

## 6. PRE_EMI_INTEREST Table

**Purpose:** Track interest for the period before EMI starts (can be days or months).

**Interest Formula (Compound Interest - Monthly Compounding):**
```
Total = Principal × (1 + Rate/12)^(Days/30)
Interest = Total - Principal
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| loan_id | UUID | Which loan |
| period_start | DATE | Start of interest period |
| period_end | DATE | End of interest period |
| days_count | INT | Number of days in period |
| principal_amount | DECIMAL | Principal for calculation |
| interest_rate | DECIMAL | Annual rate (e.g., 9.5) |
| interest_amount | DECIMAL | Calculated interest |
| due_date | DATE | When payment is due |
| is_paid | BOOLEAN | Payment status |

**Example 1 - Shubham (45 days):**
```
Principal = ₹7,000
Rate = 9.5%
Days = 45

Total = 7000 × (1 + 0.095/12)^(45/30)
      = 7000 × (1.00792)^1.5
      = 7000 × 1.01191
      = ₹7,083

Interest = 7083 - 7000 = ₹83
```

**Example 2 - Abhishek C (3 months = 90 days):**
```
Principal = ₹3,500
Rate = 9.5%
Days = 90

Total = 3500 × (1 + 0.095/12)^(90/30)
      = 3500 × (1.00792)^3
      = 3500 × 1.02398
      = ₹3,584

Interest = 3584 - 3500 = ₹84
```

**Example 3 - Ajay (105 days):**
```
Principal = ₹3,000
Rate = 10%
Days = 105

Total = 3000 × (1 + 0.10/12)^(105/30)
      = 3000 × (1.00833)^3.5
      = 3000 × 1.02951
      = ₹3,088

Interest = 3088 - 3000 = ₹88
```

**Flexible EMI Start:**
- EMI can start anytime (day 1, month 3, year 2, etc.)
- Pre-EMI interest is calculated for the gap period using compound interest
- If EMI not started by end of year 2, it MUST start in year 3
- Multiple pre-EMI interest entries possible (e.g., quarterly payments)

---

## 7. EMI_SCHEDULE Table

**Purpose:** Track Year 3 monthly EMIs with reducing balance interest.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| loan_id | UUID | Which loan |
| emi_number | INT | 1, 2, 3... up to 12 |
| due_date | DATE | Monthly due date |
| principal_component | DECIMAL | Principal portion of EMI |
| interest_component | DECIMAL | Interest on remaining balance |
| total_emi | DECIMAL | principal + interest |
| outstanding_after | DECIMAL | Balance after this EMI |
| is_paid | BOOLEAN | Payment status |

**EMI Calculation (Reducing Balance):**
```
Loan: ₹10,000 at 10% annual (0.833% monthly)
EMI period: 12 months

Month 1:
- Outstanding: ₹10,000
- Interest: ₹10,000 × 0.833% = ₹83.33
- Principal: EMI - Interest
- (Using standard EMI formula for equal installments)

Standard EMI = P × r × (1+r)^n / ((1+r)^n - 1)
Where P = 10,000, r = 0.00833, n = 12
EMI ≈ ₹879.16
```

**Example Schedule:**
| EMI# | Outstanding | Interest | Principal | EMI | After |
|------|-------------|----------|-----------|-----|-------|
| 1 | 10,000 | 83.33 | 795.83 | 879.16 | 9,204.17 |
| 2 | 9,204.17 | 76.70 | 802.46 | 879.16 | 8,401.71 |
| ... | ... | ... | ... | ... | ... |
| 12 | 871.89 | 7.27 | 871.89 | 879.16 | 0 |

**Edge Cases:**
- Prepayment in Year 1 or 2 → Recalculate EMI schedule
- Partial EMI payment → Track in payments table, EMI remains unpaid

---

## 8. PAYMENTS Table

**Purpose:** Record all payments (annual interest, EMIs, prepayments).

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| loan_id | UUID | Which loan |
| user_id | UUID | Who paid |
| amount | DECIMAL | Total payment |
| principal_component | DECIMAL | Goes to principal |
| interest_component | DECIMAL | Goes to interest |
| payment_type | VARCHAR | 'annual_interest', 'emi', 'prepayment' |
| payment_date | DATE | When paid |
| annual_interest_id | UUID | Links to annual_interest if applicable |
| emi_schedule_id | UUID | Links to emi_schedule if applicable |
| recorded_by | UUID | Admin who recorded |

**Example - Annual Interest Payment:**
```sql
INSERT INTO payments (
    loan_id, user_id, amount, interest_component, payment_type, 
    payment_date, annual_interest_id
) VALUES (
    'loan-uuid', 'ravi-uuid', 1000, 1000, 'annual_interest',
    '2027-06-01', 'annual-interest-uuid'
);

-- Also update annual_interest table
UPDATE annual_interest SET is_paid = TRUE, paid_amount = 1000, paid_at = '2027-06-01'
WHERE id = 'annual-interest-uuid';
```

**Example - EMI Payment:**
```sql
INSERT INTO payments (
    loan_id, user_id, amount, principal_component, interest_component,
    payment_type, payment_date, emi_schedule_id
) VALUES (
    'loan-uuid', 'ravi-uuid', 879.16, 795.83, 83.33, 'emi',
    '2028-07-01', 'emi-schedule-uuid'
);

-- Trigger automatically:
-- 1. Updates loan.outstanding_principal
-- 2. Marks loan as 'completed' if outstanding = 0
```

**Example - Prepayment:**
```sql
-- Ravi wants to pay ₹5,000 extra in Year 1
INSERT INTO payments (
    loan_id, user_id, amount, principal_component, payment_type, payment_date
) VALUES (
    'loan-uuid', 'ravi-uuid', 5000, 5000, 'prepayment', '2026-12-15'
);

-- Outstanding reduces: ₹10,000 → ₹5,000
-- Year 2 interest will be on ₹5,000 instead of ₹10,000
-- EMI schedule needs recalculation
```

---

## Relationship Diagram

```
users
  │
  ├──< deposits (user_id)
  │
  ├──< loans (user_id)
  │     │
  │     ├──< annual_interest (loan_id)
  │     │
  │     ├──< emi_schedule (loan_id)
  │     │
  │     └──< payments (loan_id)
  │
  └──< payments (user_id, recorded_by)

interest_brackets (standalone, referenced by function)
fund_settings (standalone, referenced by triggers/functions)
```

---

## Complete Flow Example

**Scenario:** Ravi joins, deposits, takes loan, repays

```
1. REGISTRATION (Jan 2026)
   - Ravi registers → users.status = 'pending'
   - Admin approves → users.status = 'active', joined_at = 'Jan 20, 2026'

2. DEPOSITS (Jan - Jun 2026)
   - Month 1: ₹300 → cumulative: ₹300
   - Month 2: ₹300 → cumulative: ₹600
   - Month 3: ₹600 → cumulative: ₹1,200
   - Month 4: ₹300 → cumulative: ₹1,500
   - Month 5: ₹300 → cumulative: ₹1,800
   - Month 6: ₹300 → cumulative: ₹2,100

3. LOAN REQUEST (Jun 2026)
   - Total pool: ₹50,000
   - Ravi's deposits: ₹2,100
   - Max eligible: 40% × 50,000 = ₹20,000
   - Ravi requests: ₹7,000
   - Multiplier: 7,000 / 2,100 = 3.33x → 10% interest
   - Loan created with:
     - disbursed_at: Jun 20, 2026
     - emi_start_date: Jun 20, 2028
     - maturity_date: Jun 20, 2029

4. ANNUAL INTEREST ENTRIES CREATED
   - Year 1: ₹700 due Jun 20, 2027
   - Year 2: ₹700 due Jun 20, 2028

5. YEAR 1 INTEREST PAYMENT (Jun 2027)
   - Ravi pays ₹700
   - annual_interest[year_1].is_paid = TRUE

6. YEAR 2 INTEREST PAYMENT (Jun 2028)
   - Ravi pays ₹700
   - annual_interest[year_2].is_paid = TRUE

7. EMI SCHEDULE GENERATED (Jun 2028)
   - 12 EMIs from Jul 2028 to Jun 2029
   - Each EMI ≈ ₹616 (reducing balance on ₹7,000 at 10%)

8. EMI PAYMENTS (Jul 2028 - Jun 2029)
   - Monthly payments recorded
   - outstanding_principal reduces each month
   - Final EMI → outstanding = 0 → loan.status = 'completed'
```

---

## Edge Cases Summary

| Scenario | Handling |
|----------|----------|
| 3rd loan request | Trigger blocks INSERT |
| Deposit not multiple of 300 | Trigger rejects |
| Insufficient cumulative deposit | Trigger rejects |
| Loan exceeds eligibility | Application layer rejects |
| EMI start > 2 years | CHECK constraint fails |
| Maturity > 3 years | CHECK constraint fails |
| Prepayment | Recalculate EMI schedule |
| Partial payment | Track in payments, schedule entry stays unpaid |
| User deactivated with active loan | Loan remains, user can't take new loans |
