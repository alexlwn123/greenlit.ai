// FDA deficiency letter question templates, keyed by domain × priority.
// Language is representative of patterns in public FDA GRAS deficiency letters
// (see 21 CFR 170.225 and the FDA GRAS Notice Inventory).

export const FDA_QUESTIONS = {
  safety_data: {
    foundational: {
      question: `Please provide genotoxicity data for [substance], including at minimum an Ames test (bacterial reverse mutation assay) and an in vitro chromosomal aberration or mouse lymphoma assay. If relying on read-across from structurally related substances, provide a structural analogy justification with a side-by-side comparison.`,
      note: 'FDA considers genotoxicity data essential for any novel substance without an established safety record.',
    },
    material: {
      question:
        `Please clarify how the animal study dose levels relate to the estimated daily intake (EDI) for [substance] under the proposed conditions of use. The safety margin (NOAEL ÷ EDI) should be calculated, presented, and discussed in the context of accepted thresholds.`,
      note: 'FDA routinely requests safety margin calculations when study doses and human exposure are not explicitly compared.',
    },
    documentation_issue: {
      question:
        `Please provide the full study reports — not summaries — for the safety studies cited in your notice, including complete protocols, raw data tables, and statistical analyses.`,
      note: 'FDA requires complete study reports; secondary literature summaries do not satisfy this requirement.',
    },
  },

  dietary_exposure: {
    foundational: {
      question:
        `Please provide a quantitative dietary exposure estimate for [substance] as used under the proposed conditions of use. The estimate should use NHANES/USDA food consumption survey data and address both mean and 90th-percentile consumers. Please specify which food categories were included and justify any concentration or market-share assumptions.`,
      note: 'A quantitative dietary exposure estimate is required for FDA to assess whether intake is within safe ranges.',
    },
    material: {
      question:
        `The dietary exposure estimate provided does not appear to account for all proposed food uses. Please revise to include [food category] and confirm the total estimated daily intake reflects all use levels across every proposed food category.`,
      note: 'FDA verifies that exposure estimates cover the full scope of intended uses before completing its evaluation.',
    },
    documentation_issue: {
      question:
        `Please provide the methodology and data sources used to derive the dietary exposure estimate, including the specific NHANES cycle(s), consumption-data processing steps, and any assumptions about concentration levels or serving sizes.`,
      note: 'Transparent documentation of exposure-modeling methodology is required for FDA review.',
    },
  },

  identity_and_characterization: {
    foundational: {
      question:
        `Please provide complete chemical characterization of [substance], including: (1) CAS Registry Number and other recognized identifiers; (2) molecular formula and weight; (3) relevant physical and chemical properties; (4) manufacturing process overview; (5) specifications with validated test methods for identity, purity, and impurities; and (6) typical and maximum impurity profiles from commercial-scale batches.`,
      note: 'FDA cannot evaluate safety without a complete identity and characterization package.',
    },
    material: {
      question:
        `The specifications provided for [substance] do not include limits for [impurity or contaminant class]. Please provide analytical data on levels present in commercial material and establish appropriate specification limits with a safety justification.`,
      note: 'FDA requires specification limits for all relevant impurities, particularly those with potential safety implications.',
    },
    documentation_issue: {
      question:
        `Please provide certificates of analysis or analytical data from commercial-scale batches of [substance] demonstrating that the material meets the specifications described in the notice.`,
      note: 'FDA requests commercial-scale analytical data to confirm that stated specifications are achievable in practice.',
    },
  },

  manufacturing_process: {
    foundational: {
      question:
        `Please provide a detailed description of the manufacturing process for [substance], including: (1) source materials and their specifications; (2) processing aids and their final disposition; (3) critical process parameters; and (4) controls that ensure consistent product quality and eliminate or minimize potential contaminants.`,
      note: 'Without a complete process description FDA cannot evaluate whether the manufacturing process itself introduces safety concerns.',
    },
    material: {
      question:
        `Please provide documentation that the production strain used to manufacture [substance] has been fully characterized for pathogenicity, toxigenicity, and the absence of transmissible mobile genetic elements. Provide the characterization data or a description of the testing performed.`,
      note: 'FDA requires documentation that production microorganisms are non-pathogenic and non-toxigenic.',
    },
    documentation_issue: {
      question:
        `Please confirm that the manufacturing process described in the notice reflects the process currently used for commercial production, or provide an updated description if any changes have been made since the notice was filed.`,
      note: 'FDA expects the process description to match what is used at commercial scale.',
    },
  },

  general_availability: {
    foundational: {
      question:
        `The notice does not adequately establish that [substance] is generally recognized as safe based on scientific procedures. Please provide peer-reviewed published studies directly supporting the safety of [substance] at the proposed conditions of use, or revise the stated basis for the GRAS determination.`,
      note: 'FDA evaluates whether cited evidence meets the scientific procedures standard under 21 CFR 170.30(b).',
    },
    material: {
      question:
        `Several studies cited in support of safety were conducted with a related substance or source material rather than [substance] itself. Please address the applicability of these studies to [substance] as manufactured and used, and provide any available bridging data.`,
      note: 'FDA scrutinizes whether cited safety data is directly applicable to the notified substance.',
    },
    documentation_issue: {
      question:
        `Please provide complete citations — authors, title, journal, volume, pages, year, and DOI — for all studies cited in the notice. Several references are incomplete and cannot be verified.`,
      note: 'Complete bibliographic information is required for FDA to locate and review cited literature.',
    },
  },

  general_acceptance: {
    foundational: {
      question:
        `Please explain how the GRAS determination for [substance] has been subjected to the scrutiny of qualified experts. Provide documentation of the expert-panel review process, the qualifications of each panel member, conflict-of-interest disclosures, and the signed expert-panel report.`,
      note: 'FDA expects GRAS conclusions to have been independently evaluated by qualified experts in relevant fields.',
    },
    material: {
      question:
        `The expert-panel report provided does not appear to address [specific safety question identified in the notice]. Please provide a supplemental expert opinion addressing this issue, or explain why it was not considered material.`,
      note: 'FDA expects the expert review to comprehensively address all substantive safety questions raised by the notice.',
    },
    documentation_issue: {
      question:
        `Please provide the CVs or professional biographies of the experts who reviewed the GRAS determination, demonstrating relevant qualifications in toxicology, food science, nutrition, or a related discipline.`,
      note: 'FDA reviews expert qualifications to confirm the review panel was appropriately constituted.',
    },
  },

  conditions_of_use: {
    foundational: {
      question:
        `The conditions of use described in the notice are not sufficiently defined to allow evaluation. Please specify: (1) the food categories in which [substance] is intended to be used; (2) the minimum, typical, and maximum use levels in each category; and (3) the technological function served by [substance] in each food.`,
      note: 'FDA requires precisely defined conditions of use to assess safety and calculate dietary exposure.',
    },
    material: {
      question:
        `The proposed use levels for [substance] appear to exceed the levels supported by the available safety data. Please either provide additional safety data supporting the proposed levels or revise the conditions of use to align with the evidence presented.`,
      note: 'FDA evaluates whether proposed use levels fall within the range demonstrated to be safe.',
    },
    documentation_issue: {
      question:
        `Please clarify whether the intended uses of [substance] listed in the notice represent all currently marketed applications. If they represent only a subset, explain the basis for limiting the notice to these uses.`,
      note: 'FDA expects conditions of use to reflect the full scope of intended commercial application.',
    },
  },

  regulatory_submission: {
    foundational: {
      question:
        `The notice as submitted does not contain the information required under 21 CFR 170.225. Specifically, the following required elements are absent or insufficient: [element]. Please resubmit a complete notice that addresses all requirements of 21 CFR 170.225(b).`,
      note: 'FDA evaluates completeness against the minimum content requirements of 21 CFR 170.225 before substantive review.',
    },
    material: {
      question:
        `The notice references unpublished data or confidential information that is not available to FDA. Please either provide this information as part of the notice or revise the GRAS determination to rely solely on publicly available data.`,
      note: 'FDA can only evaluate safety on the basis of information it can independently access and verify.',
    },
    documentation_issue: {
      question:
        `Please provide an updated, signed certification statement and ensure all parts of the notice (Parts 1–7) are clearly labeled and organized in accordance with 21 CFR 170.225.`,
      note: 'FDA requires properly formatted and certified submissions before substantive review can begin.',
    },
  },
}

const FALLBACK_FDA_QUESTIONS = {
  foundational: {
    question: `Please provide the data and information necessary to establish the safety of [substance] under the proposed conditions of use. The notice as submitted does not contain sufficient evidence to support a GRAS determination.`,
    note: 'FDA issues deficiency letters when the primary safety basis is not adequately established.',
  },
  material: {
    question: `Please clarify and supplement the safety information provided for [substance]. The evidence presented does not fully address the identified deficiency at the proposed conditions of use.`,
    note: 'FDA requests additional information when the safety case is incomplete but not fundamentally lacking.',
  },
  documentation_issue: {
    question: `Please provide the missing or incomplete documentation referenced in your notice. All supporting data and references must be complete and accessible before substantive review can proceed.`,
    note: 'FDA requires complete documentation before it can evaluate the safety of the notified substance.',
  },
}

export function getFdaQuestion(gap, substanceName) {
  const entry = FDA_QUESTIONS[gap.domain]?.[gap.priority]
    || FALLBACK_FDA_QUESTIONS[gap.priority]
    || FALLBACK_FDA_QUESTIONS.material
  const name = substanceName || 'the notified substance'
  return {
    question: entry.question.replace(/\[substance\]/g, name),
    note: entry.note,
  }
}
