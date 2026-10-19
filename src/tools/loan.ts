/*
 * 贷款计算器：等额本息 / 等额本金
 *
 * 等额本息月供：M = P * r * (1+r)^n / ((1+r)^n - 1)
 * 等额本金月供：第 k 月 = P/n + (P - P/n*(k-1)) * r
 */

export type LoanMethod = "equal-installment" | "equal-principal";

export interface LoanInput {
  /** 贷款本金（元） */
  principal: number;
  /** 年利率（百分比，如 3.45 表示 3.45%） */
  annualRatePercent: number;
  /** 贷款月数 */
  months: number;
  method: LoanMethod;
}

export interface LoanMonthRow {
  month: number;
  /** 当月还款 */
  payment: number;
  /** 当月本金 */
  principal: number;
  /** 当月利息 */
  interest: number;
  /** 剩余本金 */
  balance: number;
}

export interface LoanResult {
  method: LoanMethod;
  principal: number;
  annualRatePercent: number;
  months: number;
  monthlyRate: number;
  /** 首月月供（等额本息各月相同） */
  firstPayment: number;
  /** 末月月供（等额本金递减） */
  lastPayment: number;
  totalPayment: number;
  totalInterest: number;
  schedule: LoanMonthRow[];
}

export type LoanCalcResult =
  | { ok: true; result: LoanResult }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 年利率 % → 月利率（小数） */
export function monthlyRateFromAnnual(annualRatePercent: number): number {
  return annualRatePercent / 100 / 12;
}

/** 计算完整还款计划 */
export function calcLoan(input: LoanInput): LoanCalcResult {
  const { principal, annualRatePercent, months, method } = input;
  if (!Number.isFinite(principal) || principal <= 0) {
    return { ok: false, error: "贷款本金须为正数" };
  }
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) {
    return { ok: false, error: "年利率不能为负" };
  }
  if (!Number.isInteger(months) || months < 1 || months > 600) {
    return { ok: false, error: "期数须为 1~600 的整数（月）" };
  }

  const r = monthlyRateFromAnnual(annualRatePercent);
  const schedule: LoanMonthRow[] = [];

  if (method === "equal-installment") {
    // 零利率：均摊本金
    let payment: number;
    if (r === 0) {
      payment = principal / months;
    } else {
      const pow = Math.pow(1 + r, months);
      payment = (principal * r * pow) / (pow - 1);
    }
    let balance = principal;
    for (let k = 1; k <= months; k++) {
      const interest = balance * r;
      let principalPart = payment - interest;
      if (k === months) {
        // 最后一期抹平误差
        principalPart = balance;
        payment = principalPart + interest;
      }
      balance = Math.max(0, balance - principalPart);
      schedule.push({
        month: k,
        payment: round2(payment),
        principal: round2(principalPart),
        interest: round2(interest),
        balance: round2(balance),
      });
    }
  } else {
    const principalPart = principal / months;
    let balance = principal;
    for (let k = 1; k <= months; k++) {
      const interest = balance * r;
      let pPart = principalPart;
      if (k === months) pPart = balance;
      const payment = pPart + interest;
      balance = Math.max(0, balance - pPart);
      schedule.push({
        month: k,
        payment: round2(payment),
        principal: round2(pPart),
        interest: round2(interest),
        balance: round2(balance),
      });
    }
  }

  const totalPayment = round2(schedule.reduce((s, row) => s + row.payment, 0));
  const totalInterest = round2(totalPayment - principal);

  return {
    ok: true,
    result: {
      method,
      principal,
      annualRatePercent,
      months,
      monthlyRate: r,
      firstPayment: schedule[0].payment,
      lastPayment: schedule[schedule.length - 1].payment,
      totalPayment,
      totalInterest,
      schedule,
    },
  };
}

/** 元格式化（千分位，两位小数） */
export function formatYuan(n: number): string {
  const fixed = round2(n).toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withComma}.${dec}`;
}

export const LOAN_METHOD_LABEL: Record<LoanMethod, string> = {
  "equal-installment": "等额本息",
  "equal-principal": "等额本金",
};

/** 常用贷款年限（月） */
export const LOAN_TERM_PRESETS: { label: string; months: number }[] = [
  { label: "1 年", months: 12 },
  { label: "3 年", months: 36 },
  { label: "5 年", months: 60 },
  { label: "10 年", months: 120 },
  { label: "20 年", months: 240 },
  { label: "30 年", months: 360 },
];
