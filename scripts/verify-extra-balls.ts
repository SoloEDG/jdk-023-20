import assert from 'node:assert/strict'
import { createDocument, defaultCareer, type CareerState, type PinballDocument } from '@/shared/document'
import { checkFrameRewards, settleDrainRewards, MAX_EXTRA_BALLS, EXTRA_SCORE_THRESHOLD } from '@/features/extra-ball'
import { applyDrain } from '@/app/cabinet-actions'
import { mountFresh } from '@/features/table'
import { commitSession } from '@/features/records'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok - ${name}`)
}

function freshDoc(career: CareerState = defaultCareer()): PinballDocument {
  const doc = createDocument()
  mountFresh(doc, { career, history: [], bestScore: 0 })
  return doc
}

// 让“最后一颗常规球落下”：把常规球消耗到 1，再 drain
function drainRegularToLast(doc: PinballDocument): void {
  while (doc.ballsLeft > 1) applyDrain(doc)
}

console.log('分数跨阈值奖励')
check('跨过两万只给一颗，再涨分不再发', () => {
  const doc = freshDoc()
  doc.score = EXTRA_SCORE_THRESHOLD
  checkFrameRewards(doc)
  assert.equal(doc.extraBalls, 1)
  assert.equal(doc.extraBallsEarned, 1)
  assert.equal(doc.scoreRewardGiven, true)
  doc.score = 99999
  checkFrameRewards(doc)
  assert.equal(doc.extraBalls, 1, '不能按超出的分数再给')
})

check('没到两万不给', () => {
  const doc = freshDoc()
  doc.score = EXTRA_SCORE_THRESHOLD - 1
  checkFrameRewards(doc)
  assert.equal(doc.extraBalls, 0)
})

check('最后一颗球落下时才跨过两万，也能拿到', () => {
  const doc = freshDoc()
  drainRegularToLast(doc)
  doc.score = EXTRA_SCORE_THRESHOLD
  applyDrain(doc)
  assert.equal(doc.phase, 'ready')
  assert.equal(doc.extraBallsEarned, 1)
  assert.equal(doc.extraBalls, 0, '落下当场补发并立刻顶上')
})

console.log('生涯四项首次全亮奖励')
check('开局四项全未点亮，本局全亮且无倾斜，给一颗', () => {
  const doc = freshDoc()
  drainRegularToLast(doc)
  doc.score = 12000
  doc.career.score10k = true
  doc.career.bonusOnce = true
  doc.career.bankTwice = true
  // cleanFinish 由 settle 依据本局未倾斜来判定，并在判定时点亮
  const awarded = settleDrainRewards(doc, true)
  assert.equal(awarded, true)
  assert.equal(doc.extraBallsEarned, 1)
  assert.equal(doc.careerRewardGiven, true)
})

check('上一局已点亮过任一项，本局全亮也不再给', () => {
  const career = defaultCareer()
  career.bonusOnce = true
  const doc = freshDoc(career)
  assert.equal(doc.careerAllOpenAtStart, false)
  drainRegularToLast(doc)
  doc.career.score10k = true
  doc.career.bonusOnce = true
  doc.career.bankTwice = true
  const awarded = settleDrainRewards(doc, true)
  assert.equal(awarded, false)
  assert.equal(doc.extraBallsEarned, 0)
})

check('本局倾斜了，无倾斜收台不成立，不给生涯球', () => {
  const doc = freshDoc()
  drainRegularToLast(doc)
  doc.career.score10k = true
  doc.career.bonusOnce = true
  doc.career.bankTwice = true
  const awarded = settleDrainRewards(doc, false)
  assert.equal(awarded, false)
})

check('先发了生涯额外球，之后倾斜，cleanFinish 徽章不会被提前点亮', () => {
  const doc = freshDoc()
  doc.run.launched = true
  doc.phase = 'playing'
  drainRegularToLast(doc)
  doc.career.score10k = true
  doc.career.bonusOnce = true
  doc.career.bankTwice = true
  const awarded = settleDrainRewards(doc, true)
  assert.equal(awarded, true)
  assert.equal(doc.career.cleanFinish, false, '判定时不写生涯状态')
  // 额外球顶上并在游玩中倾斜，最后落下 -> 真的 gameover 结算
  doc.live.tilted = true
  assert.equal(doc.extraBalls, 1)
  applyDrain(doc) // 把刚奖励的额外球顶上发射槽
  assert.equal(doc.extraBalls, 0)
  assert.equal(doc.phase, 'ready')
  applyDrain(doc) // 额外球落下，无球可打
  assert.equal(doc.phase, 'gameover')
  assert.equal(doc.career.cleanFinish, false, '倾斜后结算仍不点亮')
  assert.equal(doc.history[0]?.cleanFinish, false)
  assert.equal(doc.history[0]?.extraBalls, 1)
})

check('先发了生涯额外球且最终未倾斜，结算时 cleanFinish 正常点亮', () => {
  const doc = freshDoc()
  doc.run.launched = true
  doc.phase = 'playing'
  drainRegularToLast(doc)
  doc.career.score10k = true
  doc.career.bonusOnce = true
  doc.career.bankTwice = true
  settleDrainRewards(doc, true)
  applyDrain(doc) // 把额外球顶上
  applyDrain(doc) // 额外球落下，未倾斜
  assert.equal(doc.phase, 'gameover')
  assert.equal(doc.career.cleanFinish, true)
})

console.log('上限与去重')
check('两类来源各一颗，最多两颗', () => {
  const doc = freshDoc()
  drainRegularToLast(doc)
  doc.score = EXTRA_SCORE_THRESHOLD
  doc.career.score10k = true
  doc.career.bonusOnce = true
  doc.career.bankTwice = true
  const awarded = settleDrainRewards(doc, true)
  assert.equal(awarded, true)
  assert.equal(doc.extraBallsEarned, 2)
  assert.equal(doc.extraBalls, 2)
  doc.score = 99999
  checkFrameRewards(doc)
  assert.equal(doc.extraBallsEarned, 2, '封顶两颗')
})

check('同一来源在 drain 里重复调用不会重复发', () => {
  const doc = freshDoc()
  drainRegularToLast(doc)
  doc.score = EXTRA_SCORE_THRESHOLD
  settleDrainRewards(doc, false)
  const before = doc.extraBallsEarned
  settleDrainRewards(doc, false)
  assert.equal(doc.extraBallsEarned, before)
})

console.log('出球顺序与结束')
check('常规球先打完，额外球留到最后，两边都没有才结束', () => {
  const doc = freshDoc()
  // 游玩中拿到一颗额外球
  doc.score = EXTRA_SCORE_THRESHOLD
  checkFrameRewards(doc)
  assert.equal(doc.extraBalls, 1)
  // 三颗常规球依次落下
  applyDrain(doc)
  assert.equal(doc.ballsLeft, 2)
  assert.equal(doc.extraBalls, 1, '额外球不受常规 drain 影响')
  applyDrain(doc)
  assert.equal(doc.ballsLeft, 1)
  applyDrain(doc)
  assert.equal(doc.ballsLeft, 0)
  assert.equal(doc.phase, 'ready')
  assert.equal(doc.extraBalls, 0, '额外球顶上')
  // 额外球落下，没有存货，结束
  applyDrain(doc)
  assert.equal(doc.phase, 'gameover')
})

check('额外球 drain 时不会误扣常规球计数', () => {
  const doc = freshDoc()
  doc.score = EXTRA_SCORE_THRESHOLD
  checkFrameRewards(doc)
  drainRegularToLast(doc)
  applyDrain(doc)
  assert.equal(doc.ballsLeft, 0)
  assert.equal(doc.extraBalls, 0)
  applyDrain(doc)
  assert.equal(doc.phase, 'gameover')
})

console.log('暂停不重复发放')
check('发放标志在暂停期间保持，恢复后不重复发', () => {
  const doc = freshDoc()
  doc.score = EXTRA_SCORE_THRESHOLD
  checkFrameRewards(doc)
  assert.equal(doc.extraBallsEarned, 1)
  // 模拟多帧暂停：游戏循环在 paused 时不会调用 checkFrameRewards，
  // 这里直接确认标志位不会被重置
  assert.equal(doc.scoreRewardGiven, true)
  checkFrameRewards(doc)
  assert.equal(doc.extraBallsEarned, 1)
})

console.log('重开与历史')
check('重开清掉未打完的额外球', () => {
  const doc = freshDoc()
  doc.run.launched = true
  doc.score = EXTRA_SCORE_THRESHOLD
  checkFrameRewards(doc)
  assert.equal(doc.extraBalls, 1)
  doc.phase = 'playing'
  // 模拟 restartGame：先结算再 mountFresh
  if (doc.run.launched && !doc.run.committed) commitSession(doc, doc.phase !== 'gameover')
  mountFresh(doc, { career: doc.career, history: doc.history, bestScore: doc.bestScore })
  assert.equal(doc.extraBalls, 0)
  assert.equal(doc.extraBallsEarned, 0)
  assert.equal(doc.ballsLeft, 3)
  assert.equal(doc.score, 0)
})

check('历史记录下本局拿到过几颗额外球', () => {
  const doc = freshDoc()
  doc.run.launched = true
  doc.phase = 'playing'
  doc.score = EXTRA_SCORE_THRESHOLD
  checkFrameRewards(doc)
  drainRegularToLast(doc)
  applyDrain(doc) // 额外球顶上
  applyDrain(doc) // 额外球落下 -> gameover
  assert.equal(doc.phase, 'gameover')
  const entry = doc.history[0]
  assert.ok(entry)
  assert.equal(entry.extraBalls, 1)
})

check('没有额外球的历史记录默认 0', () => {
  const doc = freshDoc()
  doc.run.launched = true
  doc.phase = 'playing'
  drainRegularToLast(doc)
  applyDrain(doc)
  assert.equal(doc.phase, 'gameover')
  assert.equal(doc.history[0]?.extraBalls, 0)
})

console.log(`\n全部 ${passed} 项通过`)
void MAX_EXTRA_BALLS
