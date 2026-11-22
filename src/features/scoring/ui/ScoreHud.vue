<script setup lang="ts">
import { computed } from 'vue'
import type { PinballDocument } from '@/shared/document'
import { speedOf } from '@/shared/geometry'
import { BASE_BALL_COUNT, MAX_EXTRA_BALLS } from '@/features/extra-ball'

const props = defineProps<{ doc: PinballDocument }>()

const regularPips = computed(() => Array.from({ length: BASE_BALL_COUNT }, (_, index) => index < props.doc.ballsLeft))
const extraPips = computed(() => Array.from({ length: MAX_EXTRA_BALLS }, (_, index) => index < props.doc.extraBalls))

const ballLabel = computed(() => {
  if (props.doc.phase === 'gameover') return '球已用尽'
  if (props.doc.ballsLeft > 0) {
    const index = BASE_BALL_COUNT + 1 - props.doc.ballsLeft
    return `常规球 第 ${index} / ${BASE_BALL_COUNT} 颗`
  }
  const extraIndex = props.doc.extraBallsEarned - props.doc.extraBalls + 1
  return `额外球 第 ${Math.max(1, extraIndex)} / ${props.doc.extraBallsEarned} 颗`
})

const clock = computed(() => {
  const total = Math.floor(props.doc.run.playMs / 1000)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
})

const speed = computed(() => Math.round(speedOf(props.doc.ball.vx, props.doc.ball.vy)))

const phaseLabel = computed(() => {
  if (props.doc.phase === 'paused') return '暂停'
  if (props.doc.phase === 'gameover') return '结束'
  if (props.doc.phase === 'ready') return '待发'
  if (props.doc.ball.held === 'plunger') return '回槽'
  return '游玩'
})
</script>

<template>
  <div class="score-window">
    <p class="score-digits" aria-live="polite">{{ doc.score }}</p>
    <dl class="score-meta">
      <div>
        <dt>最佳</dt>
        <dd>{{ Math.max(doc.bestScore, doc.score) }}</dd>
      </div>
      <div>
        <dt>用时</dt>
        <dd>{{ clock }}</dd>
      </div>
      <div>
        <dt>球速</dt>
        <dd>{{ speed }}</dd>
      </div>
      <div>
        <dt>状态</dt>
        <dd>{{ phaseLabel }}</dd>
      </div>
    </dl>
    <div class="ball-rack" role="status" aria-label="剩余球数">
      <div class="ball-group">
        <span class="ball-group-label">常规</span>
        <span class="ball-pips">
          <i v-for="(lit, index) in regularPips" :key="`regular-${index}`" :class="{ on: lit }"></i>
        </span>
      </div>
      <div class="ball-group">
        <span class="ball-group-label">额外</span>
        <span class="ball-pips">
          <i v-for="(lit, index) in extraPips" :key="`extra-${index}`" :class="['extra', { on: lit }]"></i>
        </span>
      </div>
    </div>
    <p class="ball-label">{{ ballLabel }}</p>
    <p v-if="doc.note.ms > 0" class="note-line">{{ doc.note.text }}</p>
  </div>
</template>
