import {
  AlertOctagon, AlertTriangle, Minus,
} from 'lucide-react'

export const SEVERITY_CONFIG = {
  foundational: {
    label: 'Critical', color: '#ff4040',
    bg: 'rgba(255,64,64,0.08)', border: 'rgba(255,64,64,0.3)',
    Icon: AlertOctagon,
  },
  material: {
    label: 'Moderate', color: '#ff9500',
    bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.3)',
    Icon: AlertTriangle,
  },
  documentation_issue: {
    label: 'Minor', color: '#666666',
    bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)',
    Icon: Minus,
  },
}

export const PRIORITY_ORDER = { foundational: 0, material: 1, documentation_issue: 2 }
export const PUSHBACK_ORDER = { high: 0, medium: 1, low: 2 }
export const DEFAULT_VISIBLE_GAPS = 5

export const GAP_REMEDIATION = {
  safety_data: {
    foundational: { cost: '$80K-$300K', timeline: '6-18 mo', study: 'Genotoxicity battery + subchronic rodent study' },
    material:     { cost: '$30K-$80K',  timeline: '3-6 mo',  study: 'Genotoxicity battery (Ames + chromosomal aberration)' },
    documentation_issue: { cost: '$5K-$15K', timeline: '2-4 wk', study: 'Literature compilation / expert panel review' },
  },
  dietary_exposure: {
    foundational: { cost: '$20K-$60K', timeline: '1-3 mo', study: 'Quantitative dietary exposure estimate (NHANES/TDS)' },
    material:     { cost: '$10K-$30K', timeline: '3-6 wk', study: 'Dietary exposure desk study' },
    documentation_issue: { cost: '$3K-$8K', timeline: '1-2 wk', study: 'Documentation update' },
  },
  identity_and_characterization: {
    foundational: { cost: '$15K-$50K', timeline: '1-3 mo', study: 'Analytical characterization package (purity, specs, impurities)' },
    material:     { cost: '$8K-$25K',  timeline: '3-6 wk', study: 'Supplemental analytical testing' },
    documentation_issue: { cost: '$2K-$8K', timeline: '1-2 wk', study: 'Specification documentation update' },
  },
  manufacturing_process: {
    foundational: { cost: '$10K-$40K', timeline: '1-2 mo', study: 'Process validation / GMP documentation' },
    material:     { cost: '$5K-$20K',  timeline: '2-4 wk', study: 'Process description and controls documentation' },
    documentation_issue: { cost: '$2K-$6K', timeline: '1-2 wk', study: 'Technical documentation update' },
  },
  general_availability: {
    foundational: { cost: '$15K-$40K', timeline: '1-3 mo', study: 'Literature review + expert safety opinion' },
    material:     { cost: '$8K-$20K',  timeline: '3-5 wk', study: 'Published literature compilation' },
    documentation_issue: { cost: '$2K-$8K', timeline: '1-2 wk', study: 'Citation package update' },
  },
  general_acceptance: {
    foundational: { cost: '$20K-$60K', timeline: '2-4 mo', study: 'Expert panel convening + consensus statement' },
    material:     { cost: '$8K-$25K',  timeline: '1-2 mo', study: 'Expert opinion letters / GRAS panel review' },
    documentation_issue: { cost: '$3K-$10K', timeline: '2-3 wk', study: 'Supporting expert documentation' },
  },
  conditions_of_use: {
    foundational: { cost: '$10K-$30K', timeline: '3-6 wk', study: 'Conditions of use redefinition + exposure recalculation' },
    material:     { cost: '$5K-$15K',  timeline: '2-3 wk', study: 'Conditions of use documentation update' },
    documentation_issue: { cost: '$1K-$5K', timeline: '1 wk', study: 'Label/use specification clarification' },
  },
  regulatory_submission: {
    foundational: { cost: '$10K-$25K', timeline: '2-4 wk', study: 'Regulatory affairs consultation + submission revision' },
    material:     { cost: '$5K-$12K',  timeline: '1-2 wk', study: 'Submission formatting and completeness review' },
    documentation_issue: { cost: '$1K-$4K', timeline: '3-5 days', study: 'Administrative correction' },
  },
}

export const FALLBACK_REMEDIATION = {
  foundational:        { cost: '$50K-$300K', timeline: '6-18 mo', study: 'Major safety studies or systematic documentation required' },
  material:            { cost: '$10K-$80K',  timeline: '1-6 mo',  study: 'Additional studies or documentation needed' },
  documentation_issue: { cost: '$2K-$15K',  timeline: '1-4 wk',  study: 'Documentation review and update' },
}

export function getRemediation(gap) {
  return GAP_REMEDIATION[gap.domain]?.[gap.priority]
    || FALLBACK_REMEDIATION[gap.priority]
    || FALLBACK_REMEDIATION.material
}

export const DOMAIN_SECTION_LABEL = {
  identity_and_characterization: 'Part 1 - Identity & Specifications',
  manufacturing_process:         'Part 1 - Identity & Specifications',
  dietary_exposure:              'Part 5 - Dietary Exposure',
  safety_data:                   'Part 4 - Safety',
  general_availability:          'Part 4 - Safety',
  general_acceptance:            'Part 3 - GRAS Basis',
  conditions_of_use:             'Part 2 - Intended Use',
  regulatory_submission:         'Part 6 - Narrative',
}

export function healthScoreColor(h) {
  if (h >= 90) return '#00ff88'
  if (h >= 75) return '#00cc6a'
  if (h >= 50) return '#ff9500'
  return '#ff4040'
}

export function scoreColor(score) {
  if (score === 0) return '#00ff88'
  if (score <= 10) return '#00cc6a'
  if (score <= 25) return '#ff9500'
  return '#ff4040'
}

export const PROXY_WEIGHTS = {
  dietary_exposure_estimate: 10,
  allergenicity_assessment: 10,
  genotoxicity_battery: 10,
  digestibility_data: 1,
  nutritional_impact: 1,
  human_exposure_data: 1,
  history_of_safe_use: 1,
}
export const PROXY_MAX = 34

export const BENCHMARKABLE_FIELDS = [
  'dietary_exposure_estimate',
  'allergenicity_assessment',
  'genotoxicity_battery',
  'digestibility_data',
  'nutritional_impact',
  'human_exposure_data',
  'history_of_safe_use',
]

export const FIELD_LABELS = {
  dietary_exposure_estimate: 'Dietary Exposure Estimate',
  allergenicity_assessment:  'Allergenicity Assessment',
  genotoxicity_battery:      'Genotoxicity Battery',
  digestibility_data:        'Digestibility Data',
  nutritional_impact:        'Nutritional Impact',
  human_exposure_data:       'Human Exposure Data',
  history_of_safe_use:       'History of Safe Use',
}

export const EMPIRICAL_CALIBRATION = [
  { field: 'allergenicity_assessment',  label: 'Allergenicity Assessment',  approved: 0.58, withdrawn: 0.49, delta: 0.095, signal: 'moderate' },
  { field: 'dietary_exposure_estimate', label: 'Dietary Exposure Estimate',  approved: 0.86, withdrawn: 0.80, delta: 0.061, signal: 'weak'     },
  { field: 'nutritional_impact',        label: 'Nutritional Impact',         approved: 0.24, withdrawn: 0.19, delta: 0.051, signal: 'weak'     },
  { field: 'digestibility_data',        label: 'Digestibility Data',         approved: 0.16, withdrawn: 0.11, delta: 0.044, signal: 'weak'     },
  { field: 'human_exposure_data',       label: 'Human Exposure Data',        approved: 0.29, withdrawn: 0.25, delta: 0.041, signal: 'weak'     },
  { field: 'genotoxicity_battery',      label: 'Genotoxicity Battery',       approved: 0.35, withdrawn: 0.34, delta: 0.010, signal: 'none'     },
  { field: 'history_of_safe_use',       label: 'History of Safe Use',        approved: 0.57, withdrawn: 0.57, delta: -0.001, signal: 'none'    },
]

export function peerFields(notice) {
  const sd = new Set((notice.safety_data_available || '').split(',').map(s => s.trim()))
  return {
    dietary_exposure_estimate: !!notice.exposure_estimate_included,
    allergenicity_assessment:  !!notice.allergenicity_addressed,
    genotoxicity_battery:      sd.has('genotoxicity_ames') || sd.has('genotoxicity_chromosomal'),
    digestibility_data:        sd.has('digestibility_study'),
    nutritional_impact:        sd.has('nutritional_impact'),
    human_exposure_data:       sd.has('human_clinical_trial'),
    history_of_safe_use:       sd.has('history_of_safe_use'),
  }
}

export function getApplicableFields(engagementSummary) {
  return {
    dietary_exposure_estimate: true,
    allergenicity_assessment:  true,
    genotoxicity_battery:      true,
    digestibility_data:        true,
    nutritional_impact:        true,
    human_exposure_data:       true,
    history_of_safe_use:       true,
  }
}

export function peerProxyPct(notice, applicable = null) {
  const present = peerFields(notice)
  let total = 0, missing = 0
  for (const [f, w] of Object.entries(PROXY_WEIGHTS)) {
    if (applicable && applicable[f] === false) continue
    total += w
    if (!present[f]) missing += w
  }
  return total ? Math.round(missing / total * 100) : 0
}

export const SIGNAL_ORDER = { moderate: 0, weak: 1, none: 2 }

export function getEmpiricalSignal(gap) {
  const t = ((gap.title || '') + ' ' + (gap.observation || '')).toLowerCase()
  const domain = gap.domain || ''

  if (t.includes('allergenicit'))
    return { signal: 'moderate', label: 'Moderate signal', delta: '+9.5%' }
  if (t.includes('dietary exposure') || t.includes('exposure estimate') || domain === 'dietary_exposure')
    return { signal: 'weak', label: 'Weak signal', delta: '+6.1%' }
  if (t.includes('nutritional impact') || t.includes('nutritional_impact'))
    return { signal: 'weak', label: 'Weak signal', delta: '+5.1%' }
  if (t.includes('digestibilit'))
    return { signal: 'weak', label: 'Weak signal', delta: '+4.4%' }
  if (t.includes('human exposure') || t.includes('clinical trial') || t.includes('human clinical'))
    return { signal: 'weak', label: 'Weak signal', delta: '+4.1%' }
  if (t.includes('genotoxicit') || t.includes('ames test') || t.includes('chromosomal'))
    return { signal: 'none', label: 'No signal', delta: '+1.0%' }
  if (t.includes('history of safe use') || t.includes('safe use history'))
    return { signal: 'none', label: 'No signal', delta: '-0.1%' }

  return null
}
