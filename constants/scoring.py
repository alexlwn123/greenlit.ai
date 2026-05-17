# constants/scoring.py

SEVERITY_BASELINE = {
    "dietary_exposure_estimate":            "critical",
    "allergenicity_assessment":             "critical",
    "genotoxicity_battery":                 "critical",
    "production_organism_characterization": "critical",
    "intended_use_specificity":             "high",
    "impurity_characterization":            "high",
    "manufacturing_process_detail":         "high",
    "specifications_and_purity":            "high",
    "digestibility_data":                   "medium",
    "stability_data":                       "medium",
    "nutritional_impact":                   "medium",
    "batch_consistency":                    "medium",
    "expert_panel_review":                  "medium",
    "human_exposure_data":                  "medium",
    "history_of_safe_use":                  "medium",
    "environmental_safety":                 "medium",
}

SEVERITY_UPGRADES = [
    {
        "gap_field":        "digestibility_data",
        "condition_field":  "substance_type",
        "condition_value":  "protein",
        "upgrade_to":       "critical",
    },
    {
        "gap_field":        "environmental_safety",
        "condition_field":  "production_method",
        "condition_value":  "precision_fermentation",
        "upgrade_to":       "high",
    },
    {
        "gap_field":        "expert_panel_review",
        "condition_field":  "gras_basis",
        "condition_value":  "scientific_procedures",
        "upgrade_to":       "high",
    },
    {
        "gap_field":        "history_of_safe_use",
        "condition_field":  "gras_basis",
        "condition_value":  "common_use_prior_1958",
        "upgrade_to":       "critical",
    },
]

# Scoring formula: bonus-based, max 100
BASE_SCORE = 40
SEVERITY_PRESENT_POINTS = {"critical": 10, "high": 5, "medium": 3}
SEVERITY_PRESENT_CAPS   = {"critical": 3,  "high": 3, "medium": 5}

# Human-readable titles for each gap field (used in UI output)
GAP_DISPLAY_TITLES = {
    "dietary_exposure_estimate":            "Dietary Exposure Estimate",
    "allergenicity_assessment":             "Allergenicity Assessment",
    "genotoxicity_battery":                 "Genotoxicity Battery",
    "production_organism_characterization": "Production Organism Characterization",
    "intended_use_specificity":             "Intended Use Specificity",
    "impurity_characterization":            "Impurity Characterization",
    "manufacturing_process_detail":         "Manufacturing Process Detail",
    "specifications_and_purity":            "Specifications and Purity",
    "digestibility_data":                   "Digestibility Data",
    "stability_data":                       "Stability Data",
    "nutritional_impact":                   "Nutritional Impact Assessment",
    "batch_consistency":                    "Batch Consistency Data",
    "expert_panel_review":                  "Independent Expert Panel Review",
    "human_exposure_data":                  "Human Exposure Data",
    "history_of_safe_use":                  "History of Safe Use",
    "environmental_safety":                 "Environmental Safety",
}

# What Claude should look for when detecting each gap field in a document
GAP_DETECTION_HINTS = {
    "dietary_exposure_estimate":            "quantitative dietary exposure or intake analysis using NHANES, USDA, or theoretical maximum consumption data",
    "allergenicity_assessment":             "allergenicity screening including bioinformatic homology search against FARRP/AllerHunter databases or in vitro IgE binding assays",
    "genotoxicity_battery":                 "genotoxicity studies such as Ames test (bacterial reverse mutation), chromosomal aberration, or micronucleus assay",
    "production_organism_characterization": "characterization of the production organism including taxonomic identity, genetic modifications, absence of toxin genes, or strain stability",
    "intended_use_specificity":             "specific food categories with defined use levels or maximum concentrations (e.g. up to X g/kg in product type Y)",
    "impurity_characterization":            "characterization of process-related impurities, residual solvents, or co-produced metabolites",
    "manufacturing_process_detail":         "detailed step-by-step manufacturing or production process description including fermentation parameters, purification steps",
    "specifications_and_purity":            "product specifications including purity criteria, identity tests, and acceptance limits",
    "digestibility_data":                   "in vitro pepsin/pancreatin digestibility assays or in vivo digestibility studies",
    "stability_data":                       "product stability data under storage or processing conditions",
    "nutritional_impact":                   "assessment of nutritional contribution or impact on dietary nutrient intake",
    "batch_consistency":                    "batch-to-batch consistency, reproducibility data, or certificate of analysis across multiple lots",
    "expert_panel_review":                  "independent GRAS expert panel convened to evaluate safety, with signed affidavits or a panel report",
    "human_exposure_data":                  "human clinical trial data or documented human consumption/exposure data",
    "history_of_safe_use":                  "documented history of safe use in food prior to 1958 or in another country",
    "environmental_safety":                 "environmental safety considerations including containment of the production organism or GMO regulatory status",
}
