import type * as taxonomy from "@m3-inspo/taxonomy";
import * as m from "#/paraglide/messages.js";

export const stylesLabels = {
  "minimalism": m.taxonomy_styles_minimalism,
  "editorial": m.taxonomy_styles_editorial,
  "brutalism": m.taxonomy_styles_brutalism,
  "glassmorphism": m.taxonomy_styles_glassmorphism,
  "swiss": m.taxonomy_styles_swiss,
  "maximalism": m.taxonomy_styles_maximalism,
  "playful": m.taxonomy_styles_playful,
  "dark-mode": m.taxonomy_styles_dark_mode,
  "monochrome": m.taxonomy_styles_monochrome,
  "vintage": m.taxonomy_styles_vintage,
  "futurist": m.taxonomy_styles_futurist,
} satisfies Record<(typeof taxonomy.STYLES)[number], () => string>;

export const industriesLabels = {
  "agency": m.taxonomy_industries_agency,
  "ai": m.taxonomy_industries_ai,
  "architecture": m.taxonomy_industries_architecture,
  "automotive": m.taxonomy_industries_automotive,
  "consumer-tech": m.taxonomy_industries_consumer_tech,
  "creator": m.taxonomy_industries_creator,
  "crypto": m.taxonomy_industries_crypto,
  "culture": m.taxonomy_industries_culture,
  "developer-tools": m.taxonomy_industries_developer_tools,
  "ecommerce": m.taxonomy_industries_ecommerce,
  "education": m.taxonomy_industries_education,
  "fashion": m.taxonomy_industries_fashion,
  "fintech": m.taxonomy_industries_fintech,
  "food-beverage": m.taxonomy_industries_food_beverage,
  "furniture": m.taxonomy_industries_furniture,
  "gaming": m.taxonomy_industries_gaming,
  "health": m.taxonomy_industries_health,
  "media": m.taxonomy_industries_media,
  "music": m.taxonomy_industries_music,
  "non-profit": m.taxonomy_industries_non_profit,
  "portfolio": m.taxonomy_industries_portfolio,
  "saas": m.taxonomy_industries_saas,
  "travel": m.taxonomy_industries_travel,
  "type-foundry": m.taxonomy_industries_type_foundry,
} satisfies Record<(typeof taxonomy.INDUSTRIES)[number], () => string>;

export const componentsLabels = {
  "sticky-nav": m.taxonomy_components_sticky_nav,
  "hero-with-cta": m.taxonomy_components_hero_with_cta,
  "hero-fullbleed": m.taxonomy_components_hero_fullbleed,
  "logo-cloud": m.taxonomy_components_logo_cloud,
  "bento-grid": m.taxonomy_components_bento_grid,
  "feature-trio": m.taxonomy_components_feature_trio,
  "feature-alternating": m.taxonomy_components_feature_alternating,
  "testimonial-wall": m.taxonomy_components_testimonial_wall,
  "testimonial-quote": m.taxonomy_components_testimonial_quote,
  "pricing-3-col": m.taxonomy_components_pricing_3_col,
  "faq-accordion": m.taxonomy_components_faq_accordion,
  "footer-compact": m.taxonomy_components_footer_compact,
  "case-study-card": m.taxonomy_components_case_study_card,
  "stat-strip": m.taxonomy_components_stat_strip,
  "marquee-logos": m.taxonomy_components_marquee_logos,
  "newsletter-signup": m.taxonomy_components_newsletter_signup,
  "blog-grid": m.taxonomy_components_blog_grid,
} satisfies Record<(typeof taxonomy.COMPONENTS)[number], () => string>;

export const componentTypesLabels = {
  "nav": m.taxonomy_component_types_nav,
  "hero": m.taxonomy_component_types_hero,
  "features": m.taxonomy_component_types_features,
  "pricing": m.taxonomy_component_types_pricing,
  "cta": m.taxonomy_component_types_cta,
  "testimonial": m.taxonomy_component_types_testimonial,
  "logo-cloud": m.taxonomy_component_types_logo_cloud,
  "stat": m.taxonomy_component_types_stat,
  "faq": m.taxonomy_component_types_faq,
  "footer": m.taxonomy_component_types_footer,
} satisfies Record<(typeof taxonomy.COMPONENT_TYPES)[number], () => string>;

export const vibesLabels = {
  "calm": m.taxonomy_vibes_calm,
  "loud": m.taxonomy_vibes_loud,
  "playful": m.taxonomy_vibes_playful,
  "serious": m.taxonomy_vibes_serious,
  "luxe": m.taxonomy_vibes_luxe,
  "raw": m.taxonomy_vibes_raw,
  "soft": m.taxonomy_vibes_soft,
  "technical": m.taxonomy_vibes_technical,
  "warm": m.taxonomy_vibes_warm,
  "cold": m.taxonomy_vibes_cold,
} satisfies Record<(typeof taxonomy.VIBES)[number], () => string>;

export const colorWordsLabels = {
  "warm": m.taxonomy_color_words_warm,
  "cool": m.taxonomy_color_words_cool,
  "monochrome": m.taxonomy_color_words_monochrome,
  "neon": m.taxonomy_color_words_neon,
  "earthy": m.taxonomy_color_words_earthy,
  "pastel": m.taxonomy_color_words_pastel,
  "saturated": m.taxonomy_color_words_saturated,
  "muted": m.taxonomy_color_words_muted,
  "high-contrast": m.taxonomy_color_words_high_contrast,
} satisfies Record<(typeof taxonomy.COLOR_WORDS)[number], () => string>;

export const modesLabels = {
  "light": m.taxonomy_modes_light,
  "dark": m.taxonomy_modes_dark,
} satisfies Record<(typeof taxonomy.MODES)[number], () => string>;

export const typeRolesLabels = {
  "h1": m.taxonomy_type_roles_h1,
  "h2": m.taxonomy_type_roles_h2,
  "h3": m.taxonomy_type_roles_h3,
  "body": m.taxonomy_type_roles_body,
  "caption": m.taxonomy_type_roles_caption,
  "button": m.taxonomy_type_roles_button,
} satisfies Record<(typeof taxonomy.TYPE_ROLES)[number], () => string>;

export const viewportsLabels = {
  "desktop": m.taxonomy_viewports_desktop,
  "tablet": m.taxonomy_viewports_tablet,
  "mobile": m.taxonomy_viewports_mobile,
} satisfies Record<(typeof taxonomy.VIEWPORTS)[number], () => string>;

export const captureDevicesLabels = {
  "desktop": m.taxonomy_capture_devices_desktop,
  "mobile": m.taxonomy_capture_devices_mobile,
} satisfies Record<(typeof taxonomy.CAPTURE_DEVICES)[number], () => string>;

export const macrostructuresLabels = {
  "bento-grid": m.taxonomy_macrostructures_bento_grid,
  "long-document": m.taxonomy_macrostructures_long_document,
  "marquee-hero": m.taxonomy_macrostructures_marquee_hero,
  "stat-led": m.taxonomy_macrostructures_stat_led,
  "conversational-faq": m.taxonomy_macrostructures_conversational_faq,
  "manifesto": m.taxonomy_macrostructures_manifesto,
  "photographic": m.taxonomy_macrostructures_photographic,
  "specimen": m.taxonomy_macrostructures_specimen,
  "catalogue": m.taxonomy_macrostructures_catalogue,
  "letter": m.taxonomy_macrostructures_letter,
  "index-first": m.taxonomy_macrostructures_index_first,
  "narrative-workflow": m.taxonomy_macrostructures_narrative_workflow,
  "split-studio": m.taxonomy_macrostructures_split_studio,
  "feature-stack": m.taxonomy_macrostructures_feature_stack,
  "type-specimen": m.taxonomy_macrostructures_type_specimen,
  "portfolio-grid": m.taxonomy_macrostructures_portfolio_grid,
  "map-diagram": m.taxonomy_macrostructures_map_diagram,
  "ecosystem-index": m.taxonomy_macrostructures_ecosystem_index,
  "component-playground": m.taxonomy_macrostructures_component_playground,
} satisfies Record<(typeof taxonomy.MACROSTRUCTURES)[number], () => string>;

export const paperBandsLabels = {
  "dark": m.taxonomy_paper_bands_dark,
  "mid": m.taxonomy_paper_bands_mid,
  "light": m.taxonomy_paper_bands_light,
} satisfies Record<(typeof taxonomy.PAPER_BANDS)[number], () => string>;

export const displayClassesLabels = {
  "grotesk-sans": m.taxonomy_display_classes_grotesk_sans,
  "geometric-sans": m.taxonomy_display_classes_geometric_sans,
  "roman-serif": m.taxonomy_display_classes_roman_serif,
  "italic-serif": m.taxonomy_display_classes_italic_serif,
  "slab-serif": m.taxonomy_display_classes_slab_serif,
  "mono": m.taxonomy_display_classes_mono,
  "display-condensed-bold": m.taxonomy_display_classes_display_condensed_bold,
  "display-heavy": m.taxonomy_display_classes_display_heavy,
  "system-native": m.taxonomy_display_classes_system_native,
  "handwritten": m.taxonomy_display_classes_handwritten,
} satisfies Record<(typeof taxonomy.DISPLAY_CLASSES)[number], () => string>;

export const accentHueBandsLabels = {
  "warm": m.taxonomy_accent_hue_bands_warm,
  "cool": m.taxonomy_accent_hue_bands_cool,
  "neutral": m.taxonomy_accent_hue_bands_neutral,
  "chromatic-other": m.taxonomy_accent_hue_bands_chromatic_other,
} satisfies Record<(typeof taxonomy.ACCENT_HUE_BANDS)[number], () => string>;
