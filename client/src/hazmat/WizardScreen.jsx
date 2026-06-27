import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Colors, Typography, Spacing, Radius } from './theme';

// WizardScreen — Unknown Substance Hazard Assessment / PPE determination flow
// (web port of mobile WizardScreen.tsx). Faithful translation: same WIZARD_STEPS,
// same getPrelimRisk / determinePPE / getPossibleClasses logic, same rescue-mode
// (Q1=YES) field-instrument table + protocols, the withdraw-and-stage (Q2=YES)
// branch, and the final Level A/B PPE result screen. All client-side — no API.
//
// Core principle (ERG 2024 / OSHA 29 CFR 1910.120): an unknown substance is
// ALWAYS treated as a compound, all-hazard response until proven otherwise.
// Minimum entry PPE for an unknown substance is Level B (splash + SCBA).

// ─── Step definitions ───────────────────────────────────────────────────────

// Q1 — life-safety rescue branch point
const RESCUE_QUESTION = {
  id:       'rescue_required',
  question: 'Is a life safety rescue required with an unknown substance?',
  hint:     'A victim is confirmed down inside the hazard zone and immediate entry is required.',
  options: [
    { label: 'Yes — rescue required',               value: 'yes', icon: '🏃', danger: true  },
    { label: 'No — hazmat control / investigation', value: 'no',  icon: '🔍', danger: false },
  ],
};

// Q2 — bulk / mass explosion / detonation branch point. No PPE protects against
// blast overpressure — a YES short-circuits to a Withdraw and Stage page.
const EXPLOSION_QUESTION = {
  id:       'explosion_risk',
  question: 'Is there a credible bulk or mass explosion / detonation risk from the materials in or near this fire?',
  hint:     'Bulk ammonium nitrate or other oxidizer stored at the facility. Structure or facility fire where the facility is known to store bulk chemicals (fertilizer plant, refinery, agricultural co-op, industrial site) and the involved substance has not been identified. Large quantities of organic peroxide. Magazine, mine, or known explosives / blasting-agent site. Pressurized cylinder under direct fire engulfment showing relief-valve roaring, bulging, or discoloration — imminent BLEVE indicators.',
  options: [
    { label: 'Yes — bulk / mass explosion or detonation risk credible', value: 'yes', icon: '💣', danger: true  },
    { label: 'No — no bulk explosion / detonation indicators',          value: 'no',  icon: '⭕', danger: false },
  ],
};

// Q3–Q11 — hazard-class-based assessment for PPE determination
const ASSESSMENT_STEPS = [
  {
    id:       'gas',
    question: 'Does the substance appear to be a gas — pressurized cylinder, cryogenic vessel, visible vapor cloud, or hissing release?',
    hint:     'Gas cylinders, rail/road tank cars with pressure relief valves, insulated dewars, or any actively venting container. Class 2 includes flammable, non-flammable, and toxic gases.',
    options: [
      { label: 'Yes — gas or pressurized container', value: 'yes', icon: '🛢️', danger: true  },
      { label: 'No — not a gas',                     value: 'no',  icon: '⭕',  danger: false },
    ],
  },
  {
    id:       'flammable_liquid',
    question: 'Could this be a flammable liquid — pooling, flowing, or producing flammable vapors?',
    hint:     'Look for liquid spills, fuel-like odors, rainbow sheens, or LEL meter readings. Flammable liquids (Class 3) include fuels, solvents, and alcohol-based substances.',
    options: [
      { label: 'Yes — flammable liquid possible', value: 'yes', icon: '🔥', danger: true  },
      { label: 'No — not a flammable liquid',     value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'flammable_solid',
    question: 'Could this be a flammable solid or spontaneously combustible material — self-igniting, smoldering, or giving off heat without an external source?',
    hint:     'Materials that ignite through friction, self-heating, or contact with air. Class 4 includes flammable solids (4.1) and spontaneously combustible materials (4.2).',
    options: [
      { label: 'Yes — flammable solid / spontaneous combustion', value: 'yes', icon: '🔥', danger: true  },
      { label: 'No — not a flammable solid',                     value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'water_reactive',
    question: 'Is there any evidence of water reactivity — violent reaction, steam, bubbling, or smoke on contact with moisture?',
    hint:     'Do not apply water until reactivity is ruled out. Class 4.3 materials react dangerously with water, producing flammable or toxic gases.',
    options: [
      { label: 'Yes — water reactivity observed', value: 'yes', icon: '💧', danger: true  },
      { label: 'No — no water reactivity',        value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'oxidizer',
    question: 'Could an oxidizer or organic peroxide be involved — accelerating fire, intense white/yellow flames, or self-reactive material?',
    hint:     'Oxidizers (Class 5.1) and organic peroxides (5.2) intensify combustion and can cause materials that don’t normally burn to ignite.',
    options: [
      { label: 'Yes — oxidizer or organic peroxide possible', value: 'yes', icon: '⭕', danger: true  },
      { label: 'No — not an oxidizer',                        value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'toxic',
    question: 'Are there toxic indicators — victims down, symptomatic, or detectable odor/irritation at approach distance?',
    hint:     'Observe from upwind. Symptomatic victims or odor at distance confirms an actively toxic atmosphere. Class 6.1 includes poisons and toxic substances.',
    options: [
      { label: 'Yes — toxic indicators present', value: 'yes', icon: '💀', danger: true  },
      { label: 'No — no toxic indicators',       value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'radiation',
    question: 'Are there radiation indicators — trefoil symbol, proximity to a nuclear/radiological facility, or positive instrument readings?',
    hint:     'Check containers, vehicles, and placards for the three-bladed fan (trefoil) symbol. Class 7 — radioactive materials.',
    options: [
      { label: 'Yes — radiation indicators present', value: 'yes', icon: '☢️', danger: true  },
      { label: 'No — no radiation indicators',       value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'corrosive',
    question: 'Are there corrosive indicators — visible damage to containers or surfaces, chemical burns, or strong acid/base odor?',
    hint:     'Corrosives (Class 8) attack metals, skin, and eyes. Look for discolored or pitting metal, fuming liquids, or pH paper showing extreme readings.',
    options: [
      { label: 'Yes — corrosive indicators present', value: 'yes', icon: '🧪', danger: true  },
      { label: 'No — no corrosive indicators',       value: 'no',  icon: '⭕', danger: false },
    ],
  },
  {
    id:       'confined_space',
    question: 'Is the substance located in an enclosed or confined space — basement, vehicle, cargo container, tank, or building interior?',
    hint:     'Confined spaces concentrate vapors and limit exit routes. This significantly elevates entry risk regardless of other indicators.',
    options: [
      { label: 'Yes — enclosed or confined space', value: 'yes', icon: '🚪', danger: true  },
      { label: 'No — open or outdoor environment', value: 'no',  icon: '🏞️', danger: false },
    ],
  },
];

const ALL_STEPS = [RESCUE_QUESTION, EXPLOSION_QUESTION, ...ASSESSMENT_STEPS];

// ─── Live risk badge (shown during questions) ───────────────────────────────

function getPrelimRisk(answers) {
  let level = 'LOW';
  const flags = [];
  const bump = (to) => {
    const order = ['LOW', 'ELEVATED', 'HIGH', 'EXTREME'];
    if (order.indexOf(to) > order.indexOf(level)) level = to;
  };
  if (answers.gas              === 'yes') { flags.push('Gas / pressurized container');                 bump('HIGH');    }
  if (answers.flammable_liquid === 'yes') { flags.push('Flammable liquid');                            bump('HIGH');    }
  if (answers.flammable_solid  === 'yes') { flags.push('Flammable solid / spontaneous combustion');    bump('HIGH');    }
  if (answers.water_reactive   === 'yes') { flags.push('Water reactive');                              bump('HIGH');    }
  if (answers.oxidizer         === 'yes') { flags.push('Oxidizer / organic peroxide');                 bump('HIGH');    }
  if (answers.toxic            === 'yes') { flags.push('Toxic indicators — victims or odor');          bump('EXTREME'); }
  if (answers.radiation        === 'yes') { flags.push('Radiation indicators');                        bump('EXTREME'); }
  if (answers.corrosive        === 'yes') { flags.push('Corrosive indicators');                        bump('HIGH');    }
  if (answers.confined_space   === 'yes') { flags.push('Confined / enclosed space');                   bump('HIGH');    }
  return { level, flags };
}

// ─── PPE determination (NO path) ────────────────────────────────────────────

function determinePPE(answers) {
  const levelATriggers = [];
  if (answers.gas            === 'yes') levelATriggers.push('Gas / pressurized container — vapor encapsulation required');
  if (answers.toxic          === 'yes') levelATriggers.push('Toxic indicators — confirms actively toxic atmosphere');
  if (answers.corrosive      === 'yes') levelATriggers.push('Corrosive substance — vapor and splash protection required');
  if (answers.water_reactive === 'yes') levelATriggers.push('Water reactivity — active vapor generation present');
  if (answers.confined_space === 'yes') levelATriggers.push('Confined space — vapors concentrated, exit routes limited');
  const isLevelA = levelATriggers.length > 0;
  return {
    level:             isLevelA ? 'A' : 'B',
    rationale:         isLevelA ? levelATriggers
      : ['No atmospheric, vapor, or confinement indicators observed — Level B is the OSHA/EPA standard minimum for initial entry on an unknown substance'],
    proximityAdvisory: answers.flammable_liquid === 'yes' || answers.flammable_solid === 'yes' || answers.oxidizer === 'yes',
    radiationAdvisory: answers.radiation === 'yes',
    // BLEVE advisory — fires when the gas question is answered YES (the gas
    // question already covers pressurized cylinders / cryogenic vessels /
    // hissing release — any of which carry BLEVE potential under fire exposure).
    bleveAdvisory:     answers.gas === 'yes',
  };
}

// ─── Possible hazard classes based on wizard answers ────────────────────────
const HAZARD_CLASS_TAGS = [
  { cls: '2.1', label: 'Flammable Gas',            color: '#ef4444', tags: ['gas'] },
  { cls: '2.2', label: 'Non-Flammable Gas',        color: '#22c55e', tags: ['gas'] },
  { cls: '2.3', label: 'Toxic Gas (TIH)',          color: '#a855f7', tags: ['gas'] },
  { cls: '3',   label: 'Flammable Liquid',         color: '#ef4444', tags: ['flammable_liquid'] },
  { cls: '4.1', label: 'Flammable Solid',          color: '#ef4444', tags: ['flammable_solid'] },
  { cls: '4.2', label: 'Spontaneously Combustible',color: '#ef4444', tags: ['flammable_solid'] },
  { cls: '4.3', label: 'Dangerous When Wet',       color: '#3b82f6', tags: ['water_reactive'] },
  { cls: '5.1', label: 'Oxidizer',                 color: '#f59e0b', tags: ['oxidizer'] },
  { cls: '5.2', label: 'Organic Peroxide',         color: '#f59e0b', tags: ['oxidizer'] },
  { cls: '6.1', label: 'Toxic Substance',          color: '#a855f7', tags: ['toxic'] },
  { cls: '7',   label: 'Radioactive',              color: '#eab308', tags: ['radiation'] },
  { cls: '8',   label: 'Corrosive',                color: '#6b7280', tags: ['corrosive'] },
];

function getPossibleClasses(answers) {
  const yesKeys = Object.entries(answers)
    .filter(([k, v]) => v === 'yes' && k !== 'rescue_required' && k !== 'confined_space')
    .map(([k]) => k);
  if (yesKeys.length === 0) return [];
  return HAZARD_CLASS_TAGS
    .filter(hc => hc.tags.some(t => yesKeys.includes(t)))
    .map(({ cls, label, color }) => ({ cls, label, color }));
}

// ─── Level A upgrade triggers (rescue path) ─────────────────────────────────
function deriveLevelATriggers() {
  return [
    'Fluoride detection paper turns yellow — automatic Level A required. No exceptions. HF absorbs through intact skin and turnout gear does not stop it.',
    'Chlorine meter reads above 10 ppm (NIOSH IDLH) — Level A required. Exception: victim visible and alive — approach from uphill upwind with handline deployed to disperse vapors en route.',
    'Visible liquid chemical with unknown toxicity present and splash exposure is possible during operations.',
    'Confirmed corrosive vapor degrading materials at scene — Level A required unless line-of-sight rescue of a living person is viable.',
    'Multiple simultaneous chemical hazards confirmed — Level A required unless line-of-sight rescue is viable with all entry instruments within threshold.',
  ];
}

// ─── Small presentational helpers ───────────────────────────────────────────
function Dot({ color, size = 8 }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: size / 2, background: color, flexShrink: 0 }} />;
}

function DisclaimerBar({ children }) {
  return (
    <div style={{
      marginTop: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.md,
      background: Colors.bgSecondary, borderRadius: Radius.md, borderLeft: `3px solid ${Colors.brandRed}`,
    }}>
      <div style={{ fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'center', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function WizardScreen({ onSelectMaterial, onSelectGuide, onOpenSearch }) {
  const [stepIndex,    setStepIndex]    = useState(0);
  const [answers,      setAnswers]      = useState({});
  const [complete,     setComplete]     = useState(false);
  const [rescueMode,   setRescueMode]   = useState(false);
  const [withdrawMode, setWithdrawMode] = useState(false);
  const scrollRef = useRef(null);

  const currentStep = ALL_STEPS[stepIndex];
  const prelim      = getPrelimRisk(answers);
  const riskColor   = { LOW: Colors.safe, ELEVATED: Colors.warning, HIGH: Colors.critical, EXTREME: Colors.critical }[prelim.level];

  // Scroll the panel to the top whenever the view changes (question step or
  // entering a result screen) — mirrors the native screen swap behaviour.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [stepIndex, complete, rescueMode, withdrawMode]);

  const handleAnswer = useCallback((value) => {
    // Q1 — life-safety rescue gate
    if (stepIndex === 0) {
      if (value === 'yes') {
        setAnswers({ rescue_required: 'yes' });
        setRescueMode(true);
        setComplete(true);
      } else {
        setAnswers({ rescue_required: 'no' });
        setStepIndex(1);
      }
      return;
    }
    // Q2 — explosion / BLEVE / detonation gate. YES short-circuits to the
    // Withdraw and Stage branch. No PPE protects against blast overpressure.
    if (stepIndex === 1) {
      if (value === 'yes') {
        setAnswers({ ...answers, explosion_risk: 'yes' });
        setWithdrawMode(true);
        setComplete(true);
      } else {
        setAnswers({ ...answers, explosion_risk: 'no' });
        setStepIndex(2);
      }
      return;
    }
    const newAnswers = { ...answers, [currentStep.id]: value };
    setAnswers(newAnswers);
    if (stepIndex < ALL_STEPS.length - 1) {
      setStepIndex(i => i + 1);
    } else {
      setComplete(true);
    }
  }, [answers, currentStep, stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  }, [stepIndex]);

  const reset = useCallback(() => {
    setStepIndex(0); setAnswers({}); setComplete(false); setRescueMode(false); setWithdrawMode(false);
  }, []);

  const handleOpenSearch = useCallback(() => { onOpenSearch?.(); }, [onOpenSearch]);
  const handleGuide = useCallback((guideNumber) => { onSelectGuide?.(guideNumber); }, [onSelectGuide]);

  // ── RESCUE RESULTS (Q1 = YES) ──────────────────────────────────────────
  if (complete && rescueMode) {
    const laTriggers = deriveLevelATriggers();
    const meters = [
      { name: 'Radiation Detector (Survey Meter)', detects: 'Ambient ionizing radiation — dose rate (gamma/beta)', threshold: 'Back out at > 2× background gamma reading.', note: 'Sweep scene before entry. Level A, B, C, nor D protect against ionizing radiation. Elevated radiation requires withdrawal and a specialized radiation response team.', color: '#f59e0b' },
      { name: 'Dosimeter (Personal Dose Badge)',    detects: 'Cumulative radiation dose received by the individual responder', threshold: 'Turn-back: 25 REM total / 200 R/hr. Voluntary informed personnel only.', note: 'Wear before every entry. Record reading on entry and exit. Never re-enter if cumulative dose approaches limit.', color: '#f59e0b' },
      { name: 'Fluoride Detection Paper',           detects: 'Fluorine / Hydrogen Fluoride (HF)', threshold: 'Paper turns YELLOW → exit immediately', note: 'HF absorbs through intact skin — turnout gear does not stop it. Paper turns yellow = Level A before re-entry. Place F-paper on outside AND inside of visor.', color: '#f59e0b' },
      { name: 'pH Paper',                           detects: 'Acid or base (corrosive gas / liquid)', threshold: 'Strong red (acid) or blue (base) = elevated corrosive hazard', note: 'Test any visible moisture, puddles, or surface condensation.', color: '#10b981' },
      { name: 'Temperature Gun (IR)',               detects: 'Exothermic reaction / heat signature', threshold: 'Rapidly rising temp above ambient = back out', note: 'Shoot background (cold zone ground) first. Rapid increase indicates active chemical reaction.', color: '#ef4444' },
      { name: 'CGI / LEL Meter + O₂',          detects: 'Combustible gas concentration and oxygen depletion', threshold: '10% LEL = universal back-out threshold for ALL personnel', note: 'O₂ should remain at 20.9%. Every 0.1% drop = ~5,000 ppm of unknown gas displaced. Above 10% LEL — no personnel enter for any reason.', color: '#ef4444' },
      { name: 'Chlorine Meter (Cl₂)',          detects: 'Chlorine gas concentration in parts per million (ppm)', threshold: 'Any reading confirms Cl₂. Above 10 ppm (NIOSH IDLH) = Level A required.', note: 'OSHA Ceiling 1 ppm. NIOSH IDLH 10 ppm. Above 10 ppm, Level A is required. Cross-reference with F-paper.', color: Colors.critical },
      { name: 'Ammonia Meter (NH₃)',           detects: 'Ammonia gas concentration in parts per million (ppm)', threshold: 'Above 300 ppm (NIOSH IDLH) = Level A required. Back out immediately.', note: 'OSHA PEL 50 ppm TWA. NIOSH IDLH 300 ppm. Ammonia is lighter than air — check upper areas. Pungent odor detectable at 5–50 ppm, but do NOT rely on odor as a safety threshold.', color: Colors.critical },
    ];

    return (
      <div ref={scrollRef} style={styles.root}>
        <div style={styles.content}>
          <div style={{ ...styles.compoundBanner, ...styles.compoundBannerExtreme }}>
            <span style={{ fontSize: 20 }}>🏃</span>
            <div style={{ flex: 1, marginLeft: 10 }}>
              <div style={styles.compoundBannerTitle}>LIFE SAFETY RESCUE — UNKNOWN SUBSTANCE</div>
              <div style={styles.compoundBannerSub}>Maximum entry protocols. Deploy all field instruments. No personnel enter without full monitoring suite active.</div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>INITIAL ENTRY PPE</div>
            <div style={styles.ppeCard}>
              <div style={styles.ppeCardHeader}>
                <span style={{ fontSize: 26, color: Colors.accent }}>⛑️</span>
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <div style={styles.ppeCardTitle}>Structural Gear (Turnout) + SCBA</div>
                  <div style={styles.ppeCardSub}>Entry viability determined by field instruments</div>
                </div>
              </div>
              <div style={styles.ppeCardNote}>
                <span style={{ fontSize: 14, color: Colors.textSecondary }}>ℹ️</span>
                <div style={styles.ppeCardNoteText}>Level A vapor-protective suits are possible for rescue but significantly more difficult — donning time and reduced mobility can be the difference in a time-critical victim situation. Level A provides NO protection against heat and fire. Structural gear with SCBA and active field monitoring is the correct starting posture for a victim rescue in an unknown chemical environment.</div>
              </div>
            </div>
            <div style={styles.rescueCard}>
              <span style={{ fontSize: 22, color: Colors.warning }}>🏃</span>
              <div style={{ flex: 1, marginLeft: 10 }}>
                <div style={styles.rescueTitle}>LINE-OF-SIGHT RESCUE — Viable in structural gear IF:</div>
                <div style={styles.rescueItem}>• All field instruments reading within go thresholds</div>
                <div style={styles.rescueItem}>• Victim is visible — quick in, quick out</div>
                <div style={styles.rescueItem}>• Fluoride detection paper does NOT turn yellow</div>
                <div style={styles.rescueItem}>• No visible corrosive liquid chemical blocking the path</div>
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>DEPLOY ALL FIELD INSTRUMENTS</div>
            <div style={styles.sectionSub}>Read each instrument before and during entry. Any threshold breach = back out immediately.</div>
            {meters.map((meter, i) => (
              <div key={i} style={styles.meterCard}>
                <div style={styles.meterCardHeader}>
                  <Dot color={meter.color} size={10} />
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div style={styles.meterName}>{meter.name}</div>
                    <div style={styles.meterDetects}>{meter.detects}</div>
                  </div>
                </div>
                <div style={styles.meterThreshold}>
                  <div style={styles.meterThresholdLabel}>BACK-OUT THRESHOLD</div>
                  <div style={styles.meterThresholdValue}>{meter.threshold}</div>
                </div>
                <div style={styles.meterNote}>{meter.note}</div>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>IF RADIATION IS DETECTED — SEPARATE PROTOCOL</div>
            <div style={styles.radiationCard}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>☢️</div>
              <div style={styles.radiationTitle}>Level A does NOT protect against ionizing radiation</div>
              <div style={styles.radiationBody}>Elevated radiation readings require immediate withdrawal of all personnel. Back out, establish a larger perimeter, and contact a specialized radiation response team.</div>
              <div style={styles.radiationThresholds}>
                <div style={styles.radiationThresholdLabel}>DOSIMETER TURN-BACK VALUES</div>
                <div style={styles.radiationThresholdRow}>Turn-back:{'  '}25 REM total dose  /  200 R/hr dose rate</div>
                <div style={styles.radiationThresholdNote}>Applies to voluntary, fully-informed personnel only. Source: NFPA 1 / EPA Emergency Responder Guidelines.</div>
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>UPGRADE TO LEVEL A WHEN ANY OF THE FOLLOWING OCCUR</div>
            <div style={styles.levelACard}>
              <div style={{ fontSize: 22, marginBottom: 8, color: Colors.critical }}>🛡️</div>
              {laTriggers.map((trigger, i) => (
                <div key={i} style={styles.triggerRow}>
                  <span style={{ color: Colors.critical, fontSize: 13, marginTop: 1 }}>⚠</span>
                  <div style={styles.triggerText}>{trigger}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>POSSIBLE HAZARD CLASSES</div>
            <div style={styles.sectionSub}>Unknown substance — all classes are potentially relevant until identified. Start with Guide 111.</div>
            <button type="button" style={styles.classRow} onClick={() => handleGuide(111)}>
              <div style={{ ...styles.classBadge, background: Colors.accent }}><span style={styles.classBadgeText}>111</span></div>
              <span style={styles.classLabel}>Mixed Load / Unidentified Cargo</span>
              <span style={{ fontSize: 16, color: Colors.textTertiary }}>›</span>
            </button>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>EMERGENCY CONTACTS</div>
            <a href="tel:18004249300" style={styles.chemtrecBtn}>
              <span style={{ fontSize: 20, color: '#fff' }}>📞</span>
              <div style={{ marginLeft: 10 }}>
                <div style={styles.chemtrecBtnTitle}>CHEMTREC — 1-800-424-9300</div>
                <div style={styles.chemtrecBtnSub}>24/7 chemical emergency response specialists</div>
              </div>
            </a>
            <a href="tel:18004248802" style={styles.nrcBtn}>
              <span style={{ fontSize: 18, color: Colors.textSecondary }}>📞</span>
              <div style={{ marginLeft: 10 }}>
                <div style={styles.nrcBtnTitle}>NRC — 1-800-424-8802</div>
                <div style={styles.nrcBtnSub}>National Response Center — federal notification</div>
              </div>
            </a>
          </div>

          <button type="button" style={styles.resetBtn} onClick={reset}>
            <span style={{ fontSize: 14, color: Colors.textSecondary }}>↻</span>
            <span style={styles.resetBtnText}>Start New Assessment</span>
          </button>
          <DisclaimerBar>
            Do not rely on these results in an emergency — this is only a guide. PPE decisions must be confirmed by a qualified hazmat officer on scene. Always verify with CHEMTREC, shipping papers, and placards when available. ERG 2024 (PHMSA/DOT).
          </DisclaimerBar>
        </div>
      </div>
    );
  }

  // ── WITHDRAW AND STAGE (Q2 = YES) ──────────────────────────────────────
  if (complete && withdrawMode) {
    const STANDOFFS = [
      {
        distance: '800 m  /  ½ mile',
        scenario: 'Default — unknown bulk-chemical fire',
        note:     'Per ERG 2024 Guide 111 (Mixed Load / Unidentified Cargo) — evacuate 800 m (½ mile) in all directions when the fire is involving the cargo, package, or container. Use this default when the substance has not yet been identified.',
      },
      {
        distance: '800 m  /  ½ mile  →  1,600 m  /  1 mile',
        scenario: 'Bulk ammonium nitrate / oxidizers in fire',
        note:     'Per ERG 2024 Guide 140 (Oxidizers) — 800 m (½ mile) minimum for fire involvement; extend to 1,600 m (1 mile) for large-quantity / cargo-tank fire involvement. Historical case: CSB Final Report — West Fertilizer Co. (2016) and NIOSH FACE F2013-11. Twelve emergency responders were killed at roughly 150 m from a fire-driven FGAN (UN2067) detonation.',
      },
      {
        distance: '1,600 m  /  1 mile',
        scenario: 'Pressurized flammable gas tank — fire-engulfed (BLEVE)',
        note:     'Per ERG 2024 Guide 117 (Gases — Toxic and/or Flammable — Extreme Hazard) and Guide 115 (Gases — Flammable, Including Refrigerated Liquids) — evacuate 1,600 m (1 mile) in all directions if a tank, rail car, or tank truck is involved in fire. BLEVE rupture is unpredictable in timing and direction.',
      },
      {
        distance: '800 m  /  ½ mile',
        scenario: 'Suspected explosives (Division 1.1 – 1.5)',
        note:     'Per ERG 2024 Guide 112 (Explosives — Division 1.1, 1.2, 1.3, 1.5) — evacuate at least 800 m (½ mile) in all directions; if fire reaches the explosives, increase distance and request specialist resources.',
      },
    ];

    const STAGING = [
      { icon: '🚫', title: 'No entry until identification',     body: 'No personnel enter the hot zone for any reason until the substance is identified and a safe-approach plan is built. This includes recon, salvage, and exposure protection. The PPE answer to "should we enter?" on a bulk-chemical fire with explosion potential is no PPE — it is distance.' },
      { icon: '👥', title: 'Account for all personnel (PAR)',    body: 'Personnel Accountability Report on every unit. Confirm every responder, including mutual aid, is at or beyond the standoff distance. Reposition any unit inside the radius before continuing operations.' },
      { icon: '🚰', title: 'Water supply at safe distance',     body: 'Establish a sustainable water supply from beyond the standoff. Run long-lay supply lines if needed. Large flows only if the supply can sustain them without crew advance into the hot zone. Cooling unburned exposures with master streams may be defensible from cover; staffed handlines on bulk-chemical fire are not.' },
      { icon: '🔭', title: 'Identification from cover',         body: 'Use binoculars, drone, facility manager, pre-incident plan, shipping papers obtained at distance, or facility ERP. Do not approach to read placards. NFPA 704 placards on building exteriors are readable from the standoff with optics. If a UN number is identified, switch from these defaults to that material’s specific ERG isolation distances.' },
      { icon: '📋', title: 'Brief incoming units',              body: 'Pass the standoff distance, staging location, suspected hazard, and approach restriction to every arriving unit before they pass the perimeter. Stage incoming apparatus on the upwind side at or beyond the distance.' },
    ];

    const RELATED_GUIDES = [
      { num: 111, label: 'Mixed Load / Unidentified Cargo',                color: Colors.accent },
      { num: 112, label: 'Explosives — Division 1.1 – 1.5',                color: '#ef4444'     },
      { num: 140, label: 'Oxidizers (incl. ammonium nitrate UN2067)',      color: '#f59e0b'     },
      { num: 117, label: 'Gases — Toxic and/or Flammable, Extreme Hazard', color: '#ef4444'     },
    ];

    return (
      <div ref={scrollRef} style={styles.root}>
        <div style={styles.content}>
          <div style={{ ...styles.compoundBanner, ...styles.compoundBannerExtreme }}>
            <span style={{ fontSize: 20 }}>🛑</span>
            <div style={{ flex: 1, marginLeft: 10 }}>
              <div style={styles.compoundBannerTitle}>WITHDRAW AND STAGE — NO ENTRY</div>
              <div style={styles.compoundBannerSub}>Fire involving bulk chemical storage or pressurized containers with explosion / BLEVE / detonation potential. No chemical PPE protects against blast overpressure. Pull back to ERG standoff distance, account for personnel, identify the substance before any approach decision.</div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>STANDOFF DISTANCE — PER ERG 2024</div>
            <div style={styles.sectionSub}>If a UN number is identified, defer to that material’s specific ERG isolation distances. Use these as defaults when the substance is unknown.</div>
            {STANDOFFS.map((s, i) => (
              <div key={i} style={styles.standoffCard}>
                <div style={styles.standoffHeader}>
                  <span style={{ fontSize: 18, color: Colors.critical }}>📍</span>
                  <span style={styles.standoffDistance}>{s.distance}</span>
                </div>
                <div style={styles.standoffScenario}>{s.scenario}</div>
                <div style={styles.standoffNote}>{s.note}</div>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>WATER POSTURE BY FAILURE MODE</div>
            <div style={styles.sectionSub}>Whether cooling water helps depends on which failure mode you’re standing off from. Misapplying water — especially staffed handlines near a fire-exposed pressure vessel or bulk oxidizer — costs lives.</div>

            <div style={{ ...styles.waterPostureCard, ...styles.waterPostureCardBleve }}>
              <div style={styles.waterPostureHeader}>
                <span style={{ fontSize: 18, color: Colors.warning }}>🚰</span>
                <span style={{ ...styles.waterPostureTitle, color: Colors.warning }}>BLEVE-DRIVEN FAILURE — DEFENSIVE WATER MAY HELP</span>
              </div>
              <div style={styles.waterPostureBody}>Pressurized fuel containers (propane / LPG / NGL / anhydrous ammonia) or compressed-gas cylinders under fire exposure. If water supply is adequate to sustain large flows from beyond the standoff, unstaffed master-stream cooling from cover may absorb enough heat to prevent rupture. Cool from upwind / uphill with the apparatus and crew at or beyond the standoff distance. If water supply cannot sustain the flow needed — withdraw further. Staffed handlines near a fire-exposed pressure vessel are never the answer. If imminent-failure indicators appear (relief valve roaring, bulging, discoloration), withdraw immediately regardless of water supply.</div>
            </div>

            <div style={{ ...styles.waterPostureCard, ...styles.waterPostureCardDetonation }}>
              <div style={styles.waterPostureHeader}>
                <span style={{ fontSize: 18, color: Colors.explosive }}>💣</span>
                <span style={{ ...styles.waterPostureTitle, color: Colors.explosive }}>DETONATION-DRIVEN FAILURE — DISTANCE ONLY</span>
              </div>
              <div style={styles.waterPostureBody}>Bulk ammonium nitrate, bulk oxidizers, large quantities of organic peroxide, or explosives under fire exposure. There is no defensive water option for these failure modes — applying water does not arrest a fire-driven detonation, and the proximity required to apply water is the proximity that kills crews. Withdraw to the ERG standoff distance above and hold there until the substance is identified, the fire self-extinguishes, or specialist resources arrive. Historical case: CSB Final Report — West Fertilizer Co. (2016). Twelve emergency responders were killed at approximately 150 m attempting fire suppression on a bulk FGAN (UN2067) fire that detonated.</div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>STAGING TASKS</div>
            <div style={styles.sectionSub}>Run these immediately on declaration. The order is not strict — work them in parallel.</div>
            {STAGING.map((t, i) => (
              <div key={i} style={styles.stagingCard}>
                <span style={{ fontSize: 18, marginTop: 1, color: Colors.warning }}>{t.icon}</span>
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div style={styles.stagingTitle}>{t.title}</div>
                  <div style={styles.stagingBody}>{t.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>RELATED ERG GUIDES</div>
            <div style={styles.sectionSub}>Tap a guide to open its full ERG 2024 entry.</div>
            {RELATED_GUIDES.map(g => (
              <button type="button" key={g.num} style={styles.classRow} onClick={() => handleGuide(g.num)}>
                <div style={{ ...styles.classBadge, background: g.color }}>
                  <span style={styles.classBadgeText}>{g.num}</span>
                </div>
                <span style={styles.classLabel}>{g.label}</span>
                <span style={{ fontSize: 16, color: Colors.textTertiary }}>›</span>
              </button>
            ))}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>EMERGENCY CONTACTS</div>
            <a href="tel:18004249300" style={styles.chemtrecBtn}>
              <span style={{ fontSize: 20, color: '#fff' }}>📞</span>
              <div style={{ marginLeft: 10 }}>
                <div style={styles.chemtrecBtnTitle}>CHEMTREC — 1-800-424-9300</div>
                <div style={styles.chemtrecBtnSub}>24/7 chemical emergency response — identification + technical guidance</div>
              </div>
            </a>
            <a href="tel:18004248802" style={styles.nrcBtn}>
              <span style={{ fontSize: 18, color: Colors.textSecondary }}>📞</span>
              <div style={{ marginLeft: 10 }}>
                <div style={styles.nrcBtnTitle}>NRC — 1-800-424-8802</div>
                <div style={styles.nrcBtnSub}>National Response Center — federal notification for hazmat release</div>
              </div>
            </a>
          </div>

          <button type="button" style={styles.resetBtn} onClick={reset}>
            <span style={{ fontSize: 14, color: Colors.textSecondary }}>↻</span>
            <span style={styles.resetBtnText}>Start New Assessment</span>
          </button>
          <DisclaimerBar>
            Standoff distances drawn from ERG 2024 (PHMSA/DOT). Historical context: CSB Final Report — West Fertilizer Co. (2016) and NIOSH FACE F2013-11. Do not rely on these defaults in an emergency — confirm with shipping papers, placards, CHEMTREC, and incident command authority.
          </DisclaimerBar>
        </div>
      </div>
    );
  }

  // ── PPE ASSESSMENT RESULTS (Q1 = NO, Q2 = NO) ─────────────────────────
  if (complete && !rescueMode && !withdrawMode) {
    const ppe      = determinePPE(answers);
    const risk     = getPrelimRisk(answers);
    const isLevelA = ppe.level === 'A';

    const advisories = [];
    if (ppe.bleveAdvisory)     advisories.push('bleve');
    if (ppe.proximityAdvisory) advisories.push('proximity');
    if (ppe.radiationAdvisory) advisories.push('radiation');
    const lastAdvisory = advisories[advisories.length - 1];
    const trailingMargin = (key) => (key === lastAdvisory ? {} : { marginBottom: Spacing.sm });

    const possibleClasses = getPossibleClasses(answers);

    const compactMeters = [
      { name: 'CGI / LEL + O₂',          threshold: 'Back out at 10% LEL. O₂ must remain at 20.9%.',          color: '#ef4444' },
      { name: 'Fluoride Detection Paper',     threshold: 'Turns yellow = exit immediately. Level A before re-entry.', color: '#f59e0b' },
      { name: 'Chlorine Meter (Cl₂)',    threshold: 'Above 10 ppm = Level A required.',                          color: Colors.critical },
      { name: 'Ammonia Meter (NH₃)',     threshold: 'Above 300 ppm (IDLH) = Level A required.',                  color: Colors.critical },
      { name: 'Radiation Survey Meter',       threshold: 'Back out at > 2× background gamma reading.',                color: '#f59e0b' },
      { name: 'Dosimeter',                    threshold: 'Turn-back: 25 REM total / 200 R/hr.',                       color: '#f59e0b' },
    ];

    return (
      <div ref={scrollRef} style={styles.root}>
        <div style={styles.content}>
          <div style={{ ...styles.compoundBanner, ...(isLevelA ? styles.compoundBannerExtreme : {}) }}>
            <span style={{ fontSize: 20 }}>{isLevelA ? '🛑' : '🛡️'}</span>
            <div style={{ flex: 1, marginLeft: 10 }}>
              <div style={styles.compoundBannerTitle}>UNKNOWN SUBSTANCE — PPE ASSESSMENT</div>
              <div style={styles.compoundBannerSub}>Based on your observed indicators. Confirm with Incident Commander before entry.</div>
            </div>
          </div>

          {risk.flags.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>OBSERVED INDICATORS</div>
              {risk.flags.map((f, i) => (
                <div key={i} style={styles.flagChip}>
                  <span style={{ fontSize: 14, color: Colors.warning }}>›</span>
                  <span style={styles.flagChipText}>{f}</span>
                </div>
              ))}
            </div>
          )}

          {(risk.level === 'HIGH' || risk.level === 'EXTREME') && (
            <div style={styles.section}>
              <div style={styles.worstCaseCard}>
                <div style={styles.worstCaseHeader}>
                  <span style={{ fontSize: 18, color: Colors.warning }}>🛡️</span>
                  <span style={styles.worstCaseTitle}>WORST-CASE POSTURE — REFINE AS IDENTIFICATION DEVELOPS</span>
                </div>
                <div style={styles.worstCaseBody}>The PPE recommendation below is the wizard&apos;s worst-case assumption across the indicators you observed. Proceed under it if entry is required now — the wizard exists precisely because identification often is not possible before entry. In parallel, continue identification efforts: CHEMTREC (1-800-424-9300), facility manager or pre-incident plan, shipping papers retrieved at safe distance, NFPA 704 read from cover with optics, mutual-aid hazmat resources. As any single hazard is confirmed or ruled out, refine PPE and standoff to match. Do not step PPE down based on partial information — only step it down when an eliminated hazard is positively eliminated, not when it&apos;s merely unobserved.</div>
              </div>
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionLabel}>RECOMMENDED PPE LEVEL</div>
            <div style={{ ...styles.ppeLevelCard, ...(isLevelA ? styles.ppeLevelCardA : styles.ppeLevelCardB) }}>
              <div style={styles.ppeLevelHeader}>
                <span style={{ fontSize: 32, color: isLevelA ? Colors.critical : Colors.accent }}>👤</span>
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <div style={{ ...styles.ppeLevelTitle, ...(isLevelA ? styles.ppeLevelTitleA : styles.ppeLevelTitleB) }}>
                    {isLevelA ? 'Level A — Full Vapor Encapsulation + SCBA' : 'Level B — Splash Protection + SCBA'}
                  </div>
                  <div style={styles.ppeLevelSub}>
                    {isLevelA
                      ? 'Vapor-tight full encapsulation. SCBA worn inside the suit. 2-person entry minimum with backup team standing by.'
                      : 'Chemical splash suit with SCBA. Standard minimum for initial entry on an unknown substance. SCBA is always required — the vapor threat is not yet ruled out.'}
                  </div>
                </div>
              </div>
              <div style={styles.ppeLevelRationale}>
                <div style={styles.ppeLevelRationaleLabel}>{isLevelA ? 'LEVEL A TRIGGERED BY:' : 'BASIS FOR LEVEL B:'}</div>
                {ppe.rationale.map((r, i) => (
                  <div key={i} style={styles.rationaleRow}>
                    <span style={{ fontSize: 13, color: isLevelA ? Colors.critical : Colors.safe, marginTop: 1 }}>{isLevelA ? '⚠' : '✓'}</span>
                    <div style={{ ...styles.rationaleText, ...(isLevelA ? styles.rationaleTextA : styles.rationaleTextB) }}>{r}</div>
                  </div>
                ))}
              </div>
              {isLevelA && (
                <div style={styles.levelANote}>
                  <span style={{ fontSize: 13, color: Colors.textSecondary }}>ℹ️</span>
                  <div style={styles.levelANoteText}>Level A provides NO protection against fire, explosion, or ionizing radiation. If fire or radiation is also present, see advisories below.</div>
                </div>
              )}
            </div>
          </div>

          {advisories.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>{advisories.length > 1 ? 'ADVISORIES' : 'ADVISORY'}</div>
              {ppe.bleveAdvisory && (
                <div style={{ ...styles.bleveCard, ...trailingMargin('bleve') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, color: Colors.explosive }}>💣</span>
                    <span style={styles.bleveTitle}>BLEVE RISK ADVISORY</span>
                  </div>
                  <div style={styles.bleveText}>Pressurized containers under fire exposure can rupture with catastrophic blast wave and projectile / fragmentation hazard. Standard chemical PPE (Level A/B/C/D) provides NO protection against BLEVE blast or fragmentation. Per ERG 2024 Guides 115 and 117, fire involving a tank, rail car, or tank truck requires 1,600 m (1 mile) evacuation in all directions — BLEVE rupture is unpredictable in timing and direction. If water supply is adequate, unstaffed master-stream cooling from maximum cover may prevent rupture; if water supply is inadequate or the container is already directly fire-engulfed with imminent-failure indicators (relief valve roaring, bulging, discoloration), withdraw further. Do not commit personnel to staffed handlines near a fire-exposed pressure vessel.</div>
                </div>
              )}
              {ppe.proximityAdvisory && (
                <div style={{ ...styles.proximityCard, ...trailingMargin('proximity') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, color: Colors.proximityWarning }}>🔥</span>
                    <span style={styles.proximityTitle}>PROXIMITY SUIT ADVISORY</span>
                  </div>
                  <div style={styles.proximityText}>Fire or active ignition risk is present. Standard chemical suits (Level A/B/C/D) are NOT fire-rated and provide no thermal protection against flame or radiant heat. A proximity suit (aluminized, NFPA 1971) is required for operations near open flame or BLEVE risk. Proximity suits do NOT provide chemical vapor protection — they are a separate category from the Level A/B/C/D system. Coordinate with your department&apos;s proximity suit availability before committing to entry.</div>
                </div>
              )}
              {ppe.radiationAdvisory && (
                <div style={styles.radiationAdvisoryCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, color: Colors.radiation }}>☢️</span>
                    <span style={styles.radiationAdvisoryTitle}>RADIATION ADVISORY — SPECIALIST TEAM REQUIRED</span>
                  </div>
                  <div style={styles.radiationAdvisoryText}>Radiation indicators are present. Standard chemical PPE (Level A/B/C/D) protects against radioactive particle contamination (alpha/beta) but provides NO shielding against gamma or neutron radiation. If dose rates are elevated, withdraw all personnel immediately — this is not a chemical suit situation. Contact a specialized radiation response team and deploy dosimeters on every responder before any entry.</div>
                  <div style={styles.radThreshBox}>
                    <div style={styles.radThreshLabel}>DOSIMETER TURN-BACK VALUES</div>
                    <div style={styles.radThreshRow}>Turn-back:{'  '}25 REM total / 200 R/hr (voluntary, informed personnel only)</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {possibleClasses.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>POSSIBLE HAZARD CLASSES</div>
              <div style={styles.sectionSub}>Based on your observed indicators. The unknown substance could fall into any of these DOT hazard classes.</div>
              {possibleClasses.map(hc => (
                <div key={hc.cls} style={styles.classRow}>
                  <div style={{ ...styles.classBadge, background: hc.color }}>
                    <span style={styles.classBadgeText}>{hc.cls}</span>
                  </div>
                  <Dot color={hc.color} />
                  <span style={{ ...styles.classLabel, marginLeft: 8 }}>{hc.label}</span>
                </div>
              ))}
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionLabel}>DEPLOY FIELD INSTRUMENTS BEFORE ENTRY</div>
            <div style={styles.sectionSub}>Any threshold breach = back out immediately. Do not enter without active monitoring.</div>
            {compactMeters.map((m, i) => (
              <div key={i} style={styles.compactMeterRow}>
                <Dot color={m.color} />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div style={styles.compactMeterName}>{m.name}</div>
                  <div style={styles.compactMeterThreshold}>{m.threshold}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>EMERGENCY CONTACTS</div>
            <a href="tel:18004249300" style={styles.chemtrecBtn}>
              <span style={{ fontSize: 20, color: '#fff' }}>📞</span>
              <div style={{ marginLeft: 10 }}>
                <div style={styles.chemtrecBtnTitle}>CHEMTREC — 1-800-424-9300</div>
                <div style={styles.chemtrecBtnSub}>24/7 chemical emergency response specialists</div>
              </div>
            </a>
            <a href="tel:18004248802" style={styles.nrcBtn}>
              <span style={{ fontSize: 18, color: Colors.textSecondary }}>📞</span>
              <div style={{ marginLeft: 10 }}>
                <div style={styles.nrcBtnTitle}>NRC — 1-800-424-8802</div>
                <div style={styles.nrcBtnSub}>National Response Center — federal notification</div>
              </div>
            </a>
          </div>

          <button type="button" style={styles.resetBtn} onClick={reset}>
            <span style={{ fontSize: 14, color: Colors.textSecondary }}>↻</span>
            <span style={styles.resetBtnText}>Start New Assessment</span>
          </button>
          <DisclaimerBar>
            Do not rely on these results in an emergency — this is only a guide. PPE decisions must be confirmed by a qualified hazmat officer on scene. Always verify with CHEMTREC, shipping papers, and placards when available. ERG 2024 (PHMSA/DOT).
          </DisclaimerBar>
        </div>
      </div>
    );
  }

  // ── QUESTION SCREEN ────────────────────────────────────────────────────
  const progressPct   = (stepIndex / ALL_STEPS.length) * 100;
  const showRiskBadge = stepIndex > 1;

  return (
    <div ref={scrollRef} style={styles.root}>
      <div style={styles.content}>
        <div style={styles.stepHeader}>
          <div>
            <div style={styles.stepHeaderTitle}>Unknown Substance</div>
            <div style={styles.stepHeaderSub}>Field hazard assessment — response posture</div>
          </div>
          {showRiskBadge && (
            <div style={{ ...styles.riskBadge, borderColor: riskColor }}>
              <Dot color={riskColor} size={7} />
              <span style={{ ...styles.riskBadgeText, color: riskColor }}>{prelim.level}</span>
            </div>
          )}
        </div>

        {/* Intro card — only on Q1. Sets the wizard's premise (no identification
            available) and offers an escape hatch to Search if it is. */}
        {stepIndex === 0 && (
          <div style={styles.introCard}>
            <div style={styles.introCardHeader}>
              <span style={{ fontSize: 16, color: Colors.accent }}>ℹ️</span>
              <span style={styles.introCardTitle}>Unknown Substance Wizard</span>
            </div>
            <div style={styles.introCardBody}>
              This is for scenes where the involved substance cannot be identified — no visible placards, no UN number on shipping papers, no chemical name from a facility manager. If you can identify the substance, use{' '}
              <span style={styles.introCardLink} onClick={handleOpenSearch} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenSearch(); }}>Search</span>
              {' '}(UN number or name) — it will give you substance-specific ERG isolation distances, IDLH, and PPE far more accurate than this wizard&apos;s generic assessment.
            </div>
          </div>
        )}

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
        </div>
        <div style={styles.stepCounter}>Question {stepIndex + 1} of {ALL_STEPS.length}</div>

        <div style={styles.questionWrap}>
          <div style={styles.questionText}>{currentStep.question}</div>
          {currentStep.hint ? <div style={styles.hintText}>{currentStep.hint}</div> : null}
        </div>

        <div style={styles.optionsWrap}>
          {currentStep.options.map(opt => (
            <button
              type="button"
              key={opt.value}
              style={{ ...styles.optionBtn, ...(opt.danger ? styles.optionBtnDanger : {}) }}
              onClick={() => handleAnswer(opt.value)}
              aria-label={opt.label}
            >
              <span style={{ fontSize: 22, color: opt.danger ? Colors.critical : Colors.textSecondary }}>{opt.icon}</span>
              <span style={{ ...styles.optionLabel, ...(opt.danger ? styles.optionLabelDanger : {}) }}>{opt.label}</span>
              <span style={{ fontSize: 18, color: Colors.textTertiary }}>›</span>
            </button>
          ))}
        </div>

        {stepIndex > 0 && (
          <button type="button" style={styles.backBtn} onClick={goBack}>
            <span style={{ fontSize: 14, color: Colors.textTertiary }}>←</span>
            <span style={styles.backBtnText}>Back to previous question</span>
          </button>
        )}

        <DisclaimerBar>
          Do not rely on these results in an emergency — this is only a guide. Always confirm with placards, shipping papers, or{' '}
          <span style={styles.chemtrecInline}>CHEMTREC 1-800-424-9300</span>
          {' '}before committing to a response plan.
        </DisclaimerBar>
      </div>
    </div>
  );
}

// ─── Styles (inline-style objects, ported from the RN StyleSheet) ────────────
const styles = {
  root:    { height: '100%', overflowY: 'auto', background: Colors.bgPrimary },
  content: { maxWidth: 560, width: '100%', margin: '0 auto', padding: `${Spacing.sm}px ${Spacing.base}px ${Spacing.xxxl}px`, boxSizing: 'border-box' },

  stepHeader:      { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: `${Spacing.sm}px 0` },
  stepHeaderTitle: { fontSize: Typography.lg, fontWeight: 700, color: Colors.textPrimary },
  stepHeaderSub:   { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 1 },

  riskBadge:     { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 5, border: '1px solid', borderRadius: Radius.full, padding: '3px 8px' },
  riskBadgeText: { fontSize: Typography.xs, fontWeight: 700 },

  progressBar:  { height: 3, background: Colors.bgTertiary, borderRadius: 2, marginBottom: Spacing.xs },
  progressFill: { height: '100%', background: Colors.accent, borderRadius: 2 },
  stepCounter:  { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'right', marginBottom: Spacing.lg },

  questionWrap: { marginBottom: Spacing.lg },
  questionText: { fontSize: Typography.xl, fontWeight: 700, color: Colors.textPrimary, lineHeight: '30px', marginBottom: Spacing.xs },
  hintText:     { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: '20px' },

  optionsWrap:       { display: 'flex', flexDirection: 'column', gap: Spacing.sm, marginBottom: Spacing.md },
  optionBtn:         { display: 'flex', flexDirection: 'row', alignItems: 'center', textAlign: 'left', width: '100%', cursor: 'pointer', background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}`, padding: Spacing.md, gap: Spacing.sm },
  optionBtnDanger:   { background: '#1A1008', border: '1px solid #4a2a08' },
  optionLabel:       { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, fontWeight: 500 },
  optionLabelDanger: { color: Colors.warning },

  backBtn:     { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', margin: '0 auto', cursor: 'pointer', background: 'transparent', border: 'none', padding: `${Spacing.sm}px 0`, marginBottom: Spacing.sm },
  backBtnText: { fontSize: Typography.sm, color: Colors.textTertiary },

  // ── Intro card (Q1 only) ─────────────────────────────────────────────
  introCard:       { background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}`, padding: Spacing.md, marginBottom: Spacing.md },
  introCardHeader: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  introCardTitle:  { fontSize: Typography.sm, fontWeight: 700, color: Colors.accent, letterSpacing: 0.3 },
  introCardBody:   { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '18px' },
  introCardLink:   { color: Colors.accent, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' },

  compoundBanner:        { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', background: '#7f1d1d', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  compoundBannerExtreme: { background: '#450a0a' },
  compoundBannerTitle:   { fontSize: Typography.sm, fontWeight: 700, color: '#fff', marginBottom: 2 },
  compoundBannerSub:     { fontSize: Typography.xs, color: '#fca5a5', lineHeight: '18px' },

  section:      { marginBottom: Spacing.xl },
  sectionLabel: { fontSize: Typography.xs, fontWeight: 700, color: Colors.textTertiary, letterSpacing: 1, marginBottom: Spacing.sm },
  sectionSub:   { fontSize: Typography.xs, color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: -Spacing.xs, lineHeight: '16px' },

  flagChip:     { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  flagChipText: { fontSize: Typography.sm, color: Colors.warning },

  ppeCard:         { background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.accent}`, padding: Spacing.md, marginBottom: Spacing.sm },
  ppeCardHeader:   { display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  ppeCardTitle:    { fontSize: Typography.base, fontWeight: 700, color: Colors.textPrimary },
  ppeCardSub:      { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 1 },
  ppeCardNote:     { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 6, background: Colors.bgTertiary, borderRadius: Radius.sm, padding: Spacing.sm },
  ppeCardNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  rescueCard:  { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', background: '#1a1200', borderRadius: Radius.md, border: '1px solid #78350f', padding: Spacing.md },
  rescueTitle: { fontSize: Typography.xs, fontWeight: 700, color: Colors.warning, marginBottom: 6 },
  rescueItem:  { fontSize: Typography.xs, color: Colors.textSecondary, marginBottom: 2, lineHeight: '17px' },

  ppeLevelCard:           { borderRadius: Radius.md, border: '1px solid', padding: Spacing.md },
  ppeLevelCardA:          { background: '#1A0808', borderColor: '#7f1d1d' },
  ppeLevelCardB:          { background: Colors.bgSecondary, borderColor: Colors.accent },
  ppeLevelHeader:         { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  ppeLevelTitle:          { fontSize: Typography.base, fontWeight: 700, lineHeight: '22px' },
  ppeLevelTitleA:         { color: '#fca5a5' },
  ppeLevelTitleB:         { color: Colors.accent },
  ppeLevelSub:            { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px', marginTop: 3 },
  ppeLevelRationale:      { background: Colors.bgTertiary, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.sm },
  ppeLevelRationaleLabel: { fontSize: 10, fontWeight: 700, color: Colors.textTertiary, letterSpacing: 0.8, marginBottom: Spacing.xs },
  rationaleRow:           { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  rationaleText:          { flex: 1, fontSize: Typography.xs, lineHeight: '17px' },
  rationaleTextA:         { color: '#fca5a5' },
  rationaleTextB:         { color: Colors.textSecondary },
  levelANote:             { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  levelANoteText:         { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '16px' },

  // BLEVE advisory — visual consistency with EXPLOSIVE QUANTITY ADVISORY.
  bleveCard:              { background: Colors.explosiveBg, borderRadius: Radius.md, border: `1px solid ${Colors.explosive}`, padding: Spacing.md },
  bleveTitle:             { fontSize: Typography.sm, fontWeight: 700, color: Colors.explosive, marginBottom: Spacing.xs },
  bleveText:              { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  proximityCard:          { background: '#3A1E00', borderRadius: Radius.md, border: '1px solid #FF6B00', padding: Spacing.md },
  proximityTitle:         { fontSize: Typography.sm, fontWeight: 700, color: '#FF6B00', marginBottom: Spacing.xs },
  proximityText:          { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  radiationAdvisoryCard:  { background: '#1a1100', borderRadius: Radius.md, border: '1px solid #92400e', padding: Spacing.md },
  radiationAdvisoryTitle: { fontSize: Typography.sm, fontWeight: 700, color: '#fbbf24', marginBottom: Spacing.xs },
  radiationAdvisoryText:  { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px', marginBottom: Spacing.sm },
  radThreshBox:           { background: '#0f0a00', borderRadius: Radius.sm, padding: Spacing.sm },
  radThreshLabel:         { fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: 0.8, marginBottom: 4 },
  radThreshRow:           { fontSize: Typography.xs, fontWeight: 600, color: '#fde68a', marginBottom: 2, fontFamily: 'monospace', whiteSpace: 'pre-wrap' },

  compactMeterRow:       { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', background: Colors.bgSecondary, borderRadius: Radius.sm, border: `1px solid ${Colors.border}`, padding: Spacing.sm, marginBottom: Spacing.xs },
  compactMeterName:      { fontSize: Typography.sm, fontWeight: 600, color: Colors.textPrimary, marginBottom: 1 },
  compactMeterThreshold: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '16px' },

  meterCard:           { background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}`, padding: Spacing.md, marginBottom: Spacing.sm },
  meterCardHeader:     { display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  meterName:           { fontSize: Typography.base, fontWeight: 600, color: Colors.textPrimary },
  meterDetects:        { fontSize: Typography.xs, color: Colors.textSecondary },
  meterThreshold:      { background: '#1a0a0a', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.sm },
  meterThresholdLabel: { fontSize: 10, fontWeight: 700, color: Colors.critical, letterSpacing: 0.8, marginBottom: 2 },
  meterThresholdValue: { fontSize: Typography.sm, fontWeight: 600, color: '#fca5a5' },
  meterNote:           { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  radiationCard:           { background: '#1a1100', borderRadius: Radius.md, border: '1px solid #92400e', padding: Spacing.md },
  radiationTitle:          { fontSize: Typography.sm, fontWeight: 700, color: '#fbbf24', marginBottom: Spacing.sm },
  radiationBody:           { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px', marginBottom: Spacing.sm },
  radiationThresholds:     { background: '#0f0a00', borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.xs },
  radiationThresholdLabel: { fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: 0.8, marginBottom: 6 },
  radiationThresholdRow:   { fontSize: Typography.xs, fontWeight: 600, color: '#fde68a', marginBottom: 3, fontFamily: 'monospace', whiteSpace: 'pre-wrap' },
  radiationThresholdNote:  { fontSize: 11, color: Colors.textTertiary, lineHeight: '15px', marginTop: 4 },

  levelACard:  { background: '#1a0a0a', borderRadius: Radius.md, border: '1px solid #7f1d1d', padding: Spacing.md },
  triggerRow:  { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 },
  triggerText: { flex: 1, fontSize: Typography.xs, color: '#fca5a5', lineHeight: '17px' },

  // ── Withdraw and Stage (Q2 = YES) ────────────────────────────────────
  standoffCard:     { background: '#1a0a0a', borderRadius: Radius.md, border: '1px solid #7f1d1d', padding: Spacing.md, marginBottom: Spacing.sm },
  standoffHeader:   { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  standoffDistance: { fontSize: Typography.lg, fontWeight: 700, color: '#fca5a5', fontFamily: 'monospace', letterSpacing: 0.3 },
  standoffScenario: { fontSize: Typography.sm, fontWeight: 600, color: Colors.textPrimary, marginBottom: 4 },
  standoffNote:     { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  stagingCard:  { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}`, padding: Spacing.md, marginBottom: Spacing.sm },
  stagingTitle: { fontSize: Typography.sm, fontWeight: 700, color: Colors.warning, marginBottom: 3 },
  stagingBody:  { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  // ── Water posture by failure mode (Withdraw page) ──────────────────────
  waterPostureCard:           { borderRadius: Radius.md, border: '1px solid', padding: Spacing.md, marginBottom: Spacing.sm },
  waterPostureCardBleve:      { background: '#1a1200', borderColor: '#78350f' },
  waterPostureCardDetonation: { background: Colors.explosiveBg, borderColor: Colors.explosive },
  waterPostureHeader:         { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.xs },
  waterPostureTitle:          { fontSize: Typography.sm, fontWeight: 700, letterSpacing: 0.3, flex: 1 },
  waterPostureBody:           { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '17px' },

  // ── Worst-case posture advisory (PPE result page) ──────────────────────
  worstCaseCard:   { background: '#1a1200', borderRadius: Radius.md, border: '1px solid #78350f', padding: Spacing.md },
  worstCaseHeader: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.xs },
  worstCaseTitle:  { fontSize: Typography.sm, fontWeight: 700, color: Colors.warning, letterSpacing: 0.3, flex: 1 },
  worstCaseBody:   { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: '18px' },

  classRow:       { display: 'flex', flexDirection: 'row', alignItems: 'center', textAlign: 'left', width: '100%', cursor: 'pointer', background: Colors.bgSecondary, borderRadius: Radius.sm, border: `1px solid ${Colors.border}`, padding: Spacing.sm, marginBottom: Spacing.xs },
  classBadge:     { display: 'flex', borderRadius: Radius.sm, padding: '3px 8px', marginRight: 10, minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  classBadgeText: { fontSize: Typography.sm, fontWeight: 700, color: '#fff' },
  classLabel:     { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: 500 },

  chemtrecBtn:      { display: 'flex', flexDirection: 'row', alignItems: 'center', textDecoration: 'none', background: Colors.critical, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  chemtrecBtnTitle: { fontSize: Typography.base, fontWeight: 700, color: '#fff' },
  chemtrecBtnSub:   { fontSize: Typography.xs, color: '#fecaca' },
  nrcBtn:           { display: 'flex', flexDirection: 'row', alignItems: 'center', textDecoration: 'none', background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}`, padding: Spacing.md },
  nrcBtnTitle:      { fontSize: Typography.sm, fontWeight: 600, color: Colors.textPrimary },
  nrcBtnSub:        { fontSize: Typography.xs, color: Colors.textSecondary },

  resetBtn:     { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', cursor: 'pointer', background: 'transparent', border: 'none', padding: `${Spacing.md}px 0`, marginBottom: Spacing.sm },
  resetBtnText: { fontSize: Typography.sm, color: Colors.textTertiary },

  chemtrecInline: { color: Colors.critical, fontWeight: 600 },
};
