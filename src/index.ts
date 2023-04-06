import cloneDeep from "lodash.clonedeep";

/** 算法类 */
export class FRSR {
  private params: Parameters;

  constructor(params?: Partial<Parameters>) {
    const defaultParams = this.getDefaultParam();
    this.params = params ? Object.assign(defaultParams, params) : defaultParams;
  }

  /** 获取默认参数 */
  private getDefaultParam(): Parameters {
    return {
      requestRetention: 0.9,
      maximumInterval: 36500,
      easyBonus: 1.3,
      hardFactor: 1.2,
      w: this.getDefaultWeights(),
    };
  }

  /** 获取默认权重数组 */
  private getDefaultWeights(): Weights {
    return [1, 1, 5, -0.5, -0.5, 0.2, 1.4, -0.12, 0.8, 2, -0.2, 0.2, 1];
  }

  public repeat(card: Card, now: Date): Map<Rating, SchedulingInfo> {
    card = cloneDeep(card);
    now = cloneDeep(now);
    if (card.state === State.New) {
      card.elapsedDays = 0;
    } else {
      card.elapsedDays = Math.round(
        (now.getTime() - card.lastReview.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
    card.lastReview = now;
    card.reps += 1;
    const s = new SchedulingCards(card);
    s.updateState(card.state);

    switch (card.state) {
      case State.New: {
        this.initDS(s);
        s.again.due = new Date(now.getTime() + 1 * 60 * 1000);
        s.hard.due = new Date(now.getTime() + 5 * 60 * 1000);
        s.good.due = new Date(now.getTime() + 10 * 60 * 1000);
        const easyInterval = this.nextInterval(s.easy.stability * this.params.easyBonus);
        s.easy.scheduledDays = Math.round(easyInterval);
        s.easy.due = new Date(now.getTime() + easyInterval * 24 * 60 * 60 * 1000);
        break;
      }
      case State.Learning:
      case State.Relearning: {
        let hardInterval = 0.0;
        const goodInterval = this.nextInterval(s.good.stability);
        const easyInterval = Math.max(
          this.nextInterval(s.easy.stability * this.params.easyBonus),
          goodInterval + 1
        );

        s.schedule(now, hardInterval, goodInterval, easyInterval);
        break;
      }
      case State.Review: {
        const interval = card.elapsedDays;
        const lastD = card.difficulty;
        const lastS = card.stability;
        const retrievability = Math.exp((Math.log(0.9) * interval) / lastS);
        this.nextDS(s, lastD, lastS, retrievability);

        let hardInterval = this.nextInterval(lastS * this.params.hardFactor);
        const goodInterval = this.nextInterval(s.good.stability);
        hardInterval = Math.min(hardInterval, goodInterval);
        const revisedGoodInterval = Math.max(goodInterval, hardInterval + 1);
        const revisedEasyInterval = Math.max(
          this.nextInterval(s.easy.stability * this.params.easyBonus),
          revisedGoodInterval + 1
        );
        s.schedule(now, hardInterval, revisedGoodInterval, revisedEasyInterval);
        break;
      }
      default:
        break;
    }
    return s.recordLog(card, now);
  }

  /** 初始化卡片的难度和稳定性 */
  private initDS(s: SchedulingCards) {
    s.again.difficulty = this.initDifficulty(Rating.Again);
    s.again.stability = this.initStability(Rating.Again);
    s.hard.difficulty = this.initDifficulty(Rating.Hard);
    s.hard.stability = this.initStability(Rating.Hard);
    s.good.difficulty = this.initDifficulty(Rating.Good);
    s.good.stability = this.initStability(Rating.Good);
    s.easy.difficulty = this.initDifficulty(Rating.Easy);
    s.easy.stability = this.initStability(Rating.Easy);
  }

  /** 计算卡片下次的难度和稳定性 */
  private nextDS(s: SchedulingCards, lastD: number, lastS: number, retrievability: number) {
    s.again.difficulty = this.nextDifficulty(lastD, Rating.Again);
    s.again.stability = this.nextForgetStability(s.again.difficulty, lastS, retrievability);
    s.hard.difficulty = this.nextDifficulty(lastD, Rating.Hard);
    s.hard.stability = this.nextRecallStability(s.hard.difficulty, lastS, retrievability);
    s.good.difficulty = this.nextDifficulty(lastD, Rating.Good);
    s.good.stability = this.nextRecallStability(s.good.difficulty, lastS, retrievability);
    s.easy.difficulty = this.nextDifficulty(lastD, Rating.Easy);
    s.easy.stability = this.nextRecallStability(s.easy.difficulty, lastS, retrievability);
  }

  /** 初始化难度值 */
  private initStability(r: Rating): number {
    return Math.max(this.params.w[0] + this.params.w[1] * r, 0.1);
  }

  /** 初始化稳定性的值 */
  private initDifficulty(r: Rating): number {
    return this.constrainDifficulty(this.params.w[2] + this.params.w[3] * (r - 2));
  }

  /** 约束难度值在指定区间 */
  private constrainDifficulty(d: number): number {
    return Math.min(Math.max(d, 1), 10);
  }

  private nextInterval(s: number): number {
    const newInterval = (s * Math.log(this.params.requestRetention)) / Math.log(0.9);
    return Math.max(Math.min(Math.round(newInterval), this.params.maximumInterval), 1);
  }

  private nextDifficulty(d: number, r: Rating): number {
    const nextD = d + this.params.w[4] * (r - 2);
    return this.constrainDifficulty(this.meanReversion(this.params.w[2], nextD));
  }

  private meanReversion(init: number, current: number): number {
    return this.params.w[5] * init + (1 - this.params.w[5]) * current;
  }

  private nextRecallStability(d: number, s: number, r: number): number {
    return (
      s *
      (1 +
        Math.exp(this.params.w[6]) *
          (11 - d) *
          Math.pow(s, this.params.w[7]) *
          (Math.exp((1 - r) * this.params.w[8]) - 1))
    );
  }

  private nextForgetStability(d: number, s: number, r: number): number {
    return (
      this.params.w[9] *
      Math.pow(d, this.params.w[10]) *
      Math.pow(s, this.params.w[11]) *
      Math.exp((1 - r) * this.params.w[12])
    );
  }
}

/**
 * 卡片调度器
 */
class SchedulingCards {
  /** 再次学习卡片 */
  again: Card;
  /** 高难度卡片 */
  hard: Card;
  /** 普通卡片 */
  good: Card;
  /** 容易卡片 */
  easy: Card;

  constructor(card: Card) {
    this.again = cloneDeep(card);
    this.hard = cloneDeep(card);
    this.good = cloneDeep(card);
    this.easy = cloneDeep(card);
  }

  /** 更新卡片状态 */
  public updateState(state: State): void {
    switch (state) {
      case State.New:
        this.again.state = State.Learning;
        this.hard.state = State.Learning;
        this.good.state = State.Learning;
        this.easy.state = State.Review;
        this.again.lapses += 1;
        break;
      case State.Learning:
      case State.Relearning:
        this.again.state = state;
        this.hard.state = state;
        this.good.state = State.Review;
        this.easy.state = State.Review;
        break;
      case State.Review:
        this.again.state = State.Relearning;
        this.hard.state = State.Review;
        this.good.state = State.Review;
        this.easy.state = State.Review;
        this.again.lapses += 1;
        break;
    }
  }

  public schedule(now: Date, hardInterval: number, goodInterval: number, easyInterval: number) {
    this.again.scheduledDays = 0;
    this.hard.scheduledDays = Math.floor(hardInterval);
    this.good.scheduledDays = Math.floor(goodInterval);
    this.easy.scheduledDays = Math.floor(easyInterval);
    this.again.due = new Date(now.getTime() + 5 * 60 * 1000);
    if (hardInterval > 0) {
      this.hard.due = new Date(now.getTime() + Math.floor(hardInterval) * 24 * 60 * 60 * 1000);
    } else {
      this.hard.due = new Date(now.getTime() + 10 * 60 * 1000);
    }
    this.good.due = new Date(now.getTime() + Math.floor(goodInterval) * 24 * 60 * 60 * 1000);
    this.easy.due = new Date(now.getTime() + Math.floor(easyInterval) * 24 * 60 * 60 * 1000);
  }

  public recordLog(card: Card, now: Date): Map<Rating, SchedulingInfo> {
    const m = new Map<Rating, SchedulingInfo>();
    m.set(Rating.Again, {
      card: this.again,
      reviewLog: {
        rating: Rating.Again,
        scheduledDays: this.again.scheduledDays,
        elapsedDays: card.elapsedDays,
        review: now,
        state: card.state,
      },
    });
    m.set(Rating.Hard, {
      card: this.hard,
      reviewLog: {
        rating: Rating.Hard,
        scheduledDays: this.hard.scheduledDays,
        elapsedDays: card.elapsedDays,
        review: now,
        state: card.state,
      },
    });
    m.set(Rating.Good, {
      card: this.good,
      reviewLog: {
        rating: Rating.Good,
        scheduledDays: this.good.scheduledDays,
        elapsedDays: card.elapsedDays,
        review: now,
        state: card.state,
      },
    });
    m.set(Rating.Easy, {
      card: this.easy,
      reviewLog: {
        rating: Rating.Easy,
        scheduledDays: this.easy.scheduledDays,
        elapsedDays: card.elapsedDays,
        review: now,
        state: card.state,
      },
    });
    return m;
  }
}

/**
 * 卡片类
 */
export class Card {
  /** 到期时间 */
  due: Date;
  /** 稳定性 */
  stability: number;
  /** 难度 */
  difficulty: number;
  /** 已过时间 */
  elapsedDays: number;
  /** 应过时间 */
  scheduledDays: number;
  /** 记忆次数 */
  reps: number;
  /** 出现过差错（前面未过）的次数 */
  lapses: number;
  /** 状态 */
  state: State;
  /** 上次复习时间 */
  lastReview: Date;

  constructor() {
    this.due = new Date();
    this.stability = 0;
    this.difficulty = 0;
    this.elapsedDays = 0;
    this.scheduledDays = 0;
    this.reps = 0;
    this.lapses = 0;
    this.state = State.New;
    this.lastReview = new Date();
  }
}

/**
 * 参数类
 */
export interface Parameters {
  requestRetention: number; // 学习效率保留比例
  maximumInterval: number; // 最大间隔
  easyBonus: number; // 容易加分项
  hardFactor: number; // 困难加倍系数
  w: Weights; // 权重数组
}

/**
 * 复习记录类型
 */
export interface ReviewLog {
  /** 评分 */
  rating: Rating;
  /** 应当复习的天数 */
  scheduledDays: number;
  /** 已过时间 */
  elapsedDays: number;
  /** 复习时间 */
  review: Date;
  /** 卡片状态 */
  state: State;
}

/**
 * 单张卡片和对应复习记录的数据类型
 */
export interface SchedulingInfo {
  /** 对应卡片 */
  card: Card;
  /** 对应复习记录 */
  reviewLog: ReviewLog;
}

/**
 * 评分枚举类型
 */
export enum Rating {
  Again, // 再学习
  Hard, // 困难
  Good, // 普通
  Easy, // 容易
}

/**
 * 卡片状态
 */
export enum State {
  New, // 新卡片
  Learning, // 学习中
  Review, // 复习中
  Relearning, // 重新学习
}

/**
 * 权重数组类型
 */
export interface Weights extends Array<number> {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  11: number;
  12: number;
  length: 13;
}

/**
 * 将评分值转化为对应字符串的函数
 * @param rating 评分枚举类型
 * @returns 对应字符串
 */
export function ratingToString(rating: Rating): string {
  switch (rating) {
    case Rating.Again:
      return "Again";
    case Rating.Hard:
      return "Hard";
    case Rating.Good:
      return "Good";
    case Rating.Easy:
      return "Easy";
    default:
      return "unknown";
  }
}
