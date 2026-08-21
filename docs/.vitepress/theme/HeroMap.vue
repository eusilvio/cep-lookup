<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

/**
 * Full-bleed hero background. Each cycle is one lookup: three providers race
 * along different street routes toward the same address, the fastest one wins,
 * the losers are aborted mid-route, the pin drops and the address surfaces.
 * Every cycle resolves a different real CEP at a different intersection.
 * Frozen under prefers-reduced-motion.
 */

const CYCLE_MS = 7000;

/** Address data is real, straight from ViaCEP. */
const SCENES = [
  {
    cep: "01310-100",
    street: "Avenida Paulista",
    city: "Bela Vista · São Paulo/SP",
    service: "ViaCEP",
    dest: [1040, 330],
    win: "M760 330H1040",
    altA: "M760 230H940V330H1040",
    altB: "M760 440H875V330H1040",
  },
  {
    cep: "20031-170",
    street: "Avenida República do Chile",
    city: "Centro · Rio de Janeiro/RJ",
    service: "BrasilAPI",
    dest: [1150, 230],
    win: "M760 230H1150",
    altA: "M760 330H1050V230H1150",
    altB: "M760 440H985V230H1150",
  },
  {
    cep: "30130-010",
    street: "Praça Sete de Setembro",
    city: "Centro · Belo Horizonte/MG",
    service: "ViaCEP",
    dest: [960, 440],
    win: "M760 440H960",
    altA: "M760 230H860V440H960",
    altB: "M760 330H795V440H960",
  },
  {
    cep: "40026-010",
    street: "Largo Terreiro de Jesus",
    city: "Centro Histórico · Salvador/BA",
    service: "ApiCEP",
    dest: [1100, 330],
    win: "M760 330H1100",
    altA: "M760 440H1000V330H1100",
    altB: "M760 230H935V330H1100",
  },
  {
    cep: "80020-320",
    street: "Rua Marechal Deodoro",
    city: "Centro · Curitiba/PR",
    service: "OpenCEP",
    dest: [1010, 230],
    win: "M760 230H1010",
    altA: "M760 330H910V230H1010",
    altB: "M760 440H845V230H1010",
  },
  {
    cep: "90010-150",
    street: "Praça da Alfândega",
    city: "Centro Histórico · Porto Alegre/RS",
    service: "BrasilAPI",
    dest: [1160, 440],
    win: "M760 440H1160",
    altA: "M760 330H1060V440H1160",
    altB: "M760 230H995V440H1160",
  },
];

const index = ref(0);
const scene = computed(() => SCENES[index.value]);
/** Pin, pulse and readout are drawn around (1010, 330) and moved as a block. */
const shift = computed(
  () => `translate(${scene.value.dest[0] - 1010}, ${scene.value.dest[1] - 330})`,
);

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  // Swaps at the start of each cycle, while everything is still invisible.
  timer = setInterval(() => {
    index.value = (index.value + 1) % SCENES.length;
  }, CYCLE_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="hero-map" aria-hidden="true">
    <svg viewBox="0 0 1440 700" fill="none" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hm-route" x1="200" y1="120" x2="1160" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#34d399" />
          <stop offset="1" stop-color="#0ea5e9" />
        </linearGradient>
        <linearGradient id="hm-pin" x1="984" y1="250" x2="1036" y2="334" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#34d399" />
          <stop offset="1" stop-color="#0ea5e9" />
        </linearGradient>
        <mask id="hm-pin-hole">
          <rect width="1440" height="700" fill="#fff" />
          <circle cx="1010" cy="282" r="10" fill="#000" />
        </mask>
      </defs>

      <g class="streets" stroke-linecap="round">
        <path d="M-40 120H1480M-40 175H1480M-40 230H1480M-40 330H1480M-40 385H1480M-40 440H1480M-40 500H1480M-40 560H1480" />
        <path d="M180-40V740M380-40V740M500-40V740M610-40V740M715-40V740M820-40V740M915-40V740M1010-40V740M1110-40V740M1210-40V740" />
      </g>

      <g stroke="url(#hm-route)" stroke-linecap="round" stroke-linejoin="round">
        <path class="route route-win" pathLength="100" :d="scene.win" />
        <path class="route route-alt route-alt-a" pathLength="100" :d="scene.altA" />
        <path class="route route-alt route-alt-b" pathLength="100" :d="scene.altB" />
      </g>

      <g :transform="shift">
        <circle class="pulse" cx="1010" cy="330" r="9" stroke="url(#hm-pin)" />

        <g class="pin">
          <path
            mask="url(#hm-pin-hole)"
            fill="url(#hm-pin)"
            d="M1010 254a28 28 0 0 0-28 28c0 19 28 48 28 48s28-29 28-48a28 28 0 0 0-28-28z"
          />
        </g>

        <g class="readout" text-anchor="end">
          <text class="service" x="966" y="214">via {{ scene.service }}</text>
          <text class="cep" x="966" y="248">{{ scene.cep }}</text>
          <text class="street" x="966" y="272">{{ scene.street }}</text>
          <text class="city" x="966" y="292">{{ scene.city }}</text>
        </g>
      </g>

    </svg>
  </div>
</template>

<style scoped>
.hero-map {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 520px;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  /* Two masks intersected: a soft vignette, plus a hard cut before the copy
     column so no route line ever crosses the hero text. */
  -webkit-mask-image: radial-gradient(72% 95% at 78% 44%, #000 14%, transparent 80%),
    linear-gradient(to right, transparent 42%, #000 62%);
  mask-image: radial-gradient(72% 95% at 78% 44%, #000 14%, transparent 80%),
    linear-gradient(to right, transparent 42%, #000 62%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

.hero-map svg {
  width: 100%;
  height: 100%;
}

.streets path {
  stroke: var(--vp-c-divider);
  stroke-width: 9;
  opacity: 0.5;
}

.route {
  stroke-width: 7;
}

.route-win {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
}

.route-alt {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  opacity: 0.55;
}

.pulse {
  stroke-width: 3;
  opacity: 0;
  transform-origin: 1010px 330px;
}

.pin {
  opacity: 0;
  transform-origin: 1010px 330px;
}

.readout {
  opacity: 0;
  font-family: var(--vp-font-family-base);
}

.readout .service {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  fill: var(--vp-c-brand-1);
}

.readout .cep {
  font-size: 27px;
  font-weight: 800;
  letter-spacing: -0.02em;
  fill: var(--vp-c-text-1);
}

.readout .street {
  font-size: 15px;
  fill: var(--vp-c-text-1);
}

.readout .city {
  font-size: 12.5px;
  fill: var(--vp-c-text-2);
}

@media (prefers-reduced-motion: no-preference) {
  .route-win {
    animation: hm-win 7s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .route-alt-a,
  .route-alt-b {
    animation: hm-alt 7s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .pulse {
    animation: hm-pulse 7s ease-out infinite;
  }

  .pin {
    animation: hm-drop 7s cubic-bezier(0.34, 1.4, 0.5, 1) infinite;
  }

  .readout {
    animation: hm-readout 7s cubic-bezier(0.34, 1.2, 0.5, 1) infinite;
  }
}

@keyframes hm-win {
  0% { stroke-dashoffset: 100; }
  22%, 82% { stroke-dashoffset: 0; opacity: 1; }
  97%, 100% { stroke-dashoffset: 0; opacity: 0; }
}

/* The losers get aborted the moment the winner lands. */
@keyframes hm-alt {
  0% { stroke-dashoffset: 100; opacity: 0.55; }
  22% { stroke-dashoffset: 26; opacity: 0.55; }
  32%, 100% { stroke-dashoffset: 20; opacity: 0; }
}

@keyframes hm-pulse {
  0%, 22% { opacity: 0; transform: scale(0.5); }
  29% { opacity: 0.55; transform: scale(1); }
  45%, 100% { opacity: 0; transform: scale(2.6); }
}

@keyframes hm-drop {
  0%, 22% { opacity: 0; transform: translateY(-28px) scale(0.9); }
  31%, 82% { opacity: 1; transform: translateY(0) scale(1); }
  96%, 100% { opacity: 0; transform: translateY(-14px) scale(0.96); }
}

@keyframes hm-readout {
  0%, 31% { opacity: 0; transform: translateY(12px); }
  40%, 82% { opacity: 1; transform: translateY(0); }
  96%, 100% { opacity: 0; transform: translateY(7px); }
}

@media (prefers-reduced-motion: reduce) {
  .route-win { stroke-dashoffset: 0; }
  .route-alt { stroke-dashoffset: 22; opacity: 0; }
  .pin, .readout { opacity: 1; }
}

@media (max-width: 960px) {
  .hero-map {
    height: 430px;
    opacity: 0.5;
  }
}
</style>
