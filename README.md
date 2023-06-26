FSRS(Free Spaced Repetition Scheduler)算法的 TypeScript 实现，基于 Golang 版 [go-fsrs](https://github.com/open-spaced-repetition/go-fsrs) 实现。



例子：
```typescript
import { Card, FRSR, Rating } from "../index.js";

let frsr = new FRSR();
let card = new Card();
let now = new Date("2023-10-10 10:00:00");
let schedulingInfo = frsr.repeat(card, now);
const again = schedulingInfo.get(Rating.Again);

card = again.card;
now = card.due;
schedulingInfo = frsr.repeat(card, now);
const hard = schedulingInfo.get(Rating.Hard);

card = hard.card;
now = card.due;
schedulingInfo = frsr.repeat(card, now);
const good = schedulingInfo.get(Rating.Good);

card = good.card;
now = card.due;
schedulingInfo = frsr.repeat(card, now);
const easy1 = schedulingInfo.get(Rating.Easy);

card = easy1.card;
now = card.due;
schedulingInfo = frsr.repeat(card, now);
const easy2 = schedulingInfo.get(Rating.Easy);

const data = [again, hard, good, easy1, easy2];
console.log(data);
```

