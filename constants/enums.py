# constants/enums.py

STATUS = ["no_questions", "withdrawn", "pending"]

PRODUCTION_METHOD = [
    # Fermentation-based
    "precision_fermentation",        # recombinant protein via engineered microbe
    "solid_state_fermentation",      # fungal biomass, tempeh-style
    "submerged_fermentation",        # liquid fermentation, most common
    "traditional_fermentation",      # non-engineered, e.g. yogurt cultures
    
    # Cell-based
    "cell_culture",                  # cultivated meat, animal cells
    "plant_cell_culture",            # plant cells in bioreactor
    
    # Physical/chemical processing
    "extraction",                    # plant/animal protein isolation
    "enzymatic",                     # enzyme-catalyzed modification
    "chemical_synthesis",            # fully synthetic
    "hydrolysis",                    # protein hydrolysates
    "fractionation",                 # separating components e.g. dairy fractions
    
    # Emerging
    "electrospinning",               # novel texturization
    "air_fermentation",              # gas fermentation e.g. Solar Foods
    "algal_cultivation"              # microalgae production
]

SUBSTANCE_TYPE = [
    "protein", "enzyme", "microorganism", "lipid",
    "carbohydrate", "additive", "biomass", "probiotic",
    "nucleotide", "vitamin", "mineral", "flavoring_agent", "colorant"
]

SEVERITY = ["critical", "high", "medium", "low"]

SAFETY_DATA = [
    "90_day_rat_study", "genotoxicity_ames",
    "genotoxicity_chromosomal", "allergenicity_bioinformatic",
    "allergenicity_in_vitro", "acute_toxicity", "nutritional_impact",
    "chronic_toxicity", "reproductive_toxicity", "developmental_toxicity",
    "digestibility_study", "metabolic_fate", "human_clinical_trial",
    "history_of_safe_use", "in_silico_toxicology"
]

FOOD_CATEGORIES = [
    "beverages", "dairy_alternatives", "protein_bars", "bakery",
    "meat_alternatives", "infant_formula", "dietary_supplements",
    "condiments", "snacks", "general_food", "cereals_and_grains",
    "soups_and_sauces", "fats_and_oils", "confectionery",
    "fermented_foods", "sports_nutrition", "meal_replacements", "pet_food"
]

TARGET_POPULATION = [
    "general_population", "adults_only", "children",
    "not_for_infants", "athletes", "pregnant_women",
    "immunocompromised", "elderly", "per-capita"
]

GRAS_BASIS = ["scientific_procedures", "common_use_prior_1958"]

SOURCE_ORGANISM_TYPE = [
    "fungal", "bacterial", "yeast", "plant",
    "animal", "algal", "mammalian_cell", "insect"
]

DIETARY_EXPOSURE_METHOD = [
    "NHANES", "USDA_CSFII", "theoretical_maximum",
    "market_share", "not_included"
]

NOTICE_SECTION = [
    "part_1_identity", "part_2_intended_use", "part_3_gras_basis",
    "part_4_safety", "part_5_dietary_exposure",
    "part_6_narrative", "part_7_references", "cover_letter", "appendix"
]

GAP_FIELD = [
    "dietary_exposure_estimate", "allergenicity_assessment",
    "genotoxicity_battery", "production_organism_characterization",
    "intended_use_specificity", "impurity_characterization",
    "stability_data", "nutritional_impact", "batch_consistency",
    "digestibility_data", "manufacturing_process_detail",
    "specifications_and_purity", "history_of_safe_use",
    "expert_panel_review", "human_exposure_data", "environmental_safety"
]