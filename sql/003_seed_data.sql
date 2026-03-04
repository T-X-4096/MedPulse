-- ============================================================
-- 003_seed_data.sql
-- MedPulse — Sample articles for development/testing
--
-- ⚠️  Do NOT run in production.
-- Requires at least one authenticated user with author role.
-- Replace '<YOUR_USER_ID>' with a real auth.users UUID.
-- ============================================================

-- To get a user UUID: SELECT id FROM auth.users LIMIT 5;

DO $$
DECLARE
  v_author_id uuid;
BEGIN
  -- Use the first user found (adjust as needed)
  SELECT id INTO v_author_id FROM auth.users LIMIT 1;

  IF v_author_id IS NULL THEN
    RAISE NOTICE 'No users found. Create a user in Supabase Auth first.';
    RETURN;
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (v_author_id, 'Dr. Sarah Chen', 'author')
  ON CONFLICT (id) DO UPDATE SET display_name = 'Dr. Sarah Chen';

  -- Insert sample articles
  INSERT INTO public.articles
    (title, slug, summary, body, category, tags, status, author_id, published_at)
  VALUES
  (
    'Breakthrough in CAR-T Cell Therapy Shows 85% Remission Rate in Clinical Trial',
    'car-t-cell-therapy-remission-trial',
    'A phase III clinical trial has demonstrated unprecedented efficacy of next-generation CAR-T cell therapy in treatment-resistant B-cell lymphoma patients, with 85% achieving complete remission.',
    '<h2>Overview</h2>
<p>Researchers at the National Cancer Institute have published results from a landmark phase III trial investigating a novel CAR-T cell therapy targeting CD19 and CD22 antigens simultaneously. The dual-targeting approach significantly reduces relapse rates compared to single-antigen therapies.</p>

<h2>Key Findings</h2>
<p>The trial enrolled 342 patients with relapsed or refractory diffuse large B-cell lymphoma (DLBCL). Participants had previously failed at least two lines of standard therapy.</p>

<blockquote>The 85% complete remission rate at 6 months represents a paradigm shift in how we approach treatment-resistant lymphoma. These results exceeded our most optimistic projections.</blockquote>

<h2>Safety Profile</h2>
<p>Cytokine release syndrome (CRS) occurred in 62% of patients, though only 8% experienced grade 3 or higher events. Neurotoxicity was reported in 18% of participants, with most cases resolving within 4 weeks.</p>

<h2>Implications</h2>
<p>The FDA has granted Breakthrough Therapy designation to the therapy, potentially accelerating its path to approval. Researchers anticipate a BLA submission within the next 18 months.</p>',
    'oncology',
    ARRAY['car-t', 'lymphoma', 'immunotherapy', 'clinical-trial', 'oncology'],
    'published',
    v_author_id,
    now() - interval '2 days'
  ),
  (
    'New AI Diagnostic Tool Detects Early-Stage Alzheimer''s with 94% Accuracy',
    'ai-alzheimers-early-detection',
    'A machine learning model trained on multimodal biomarker data — including CSF proteins, retinal imaging, and speech patterns — can identify Alzheimer''s disease up to 7 years before symptom onset.',
    '<h2>Introduction</h2>
<p>Early diagnosis of Alzheimer''s disease has long been the holy grail of neurology. A new AI platform developed jointly by researchers at Stanford and the Mayo Clinic may finally make this a clinical reality.</p>

<h2>The Technology</h2>
<p>The model integrates data from three non-invasive sources: retinal OCT scans, speech pattern analysis from brief cognitive interviews, and a panel of 12 blood-based biomarkers. Unlike PET imaging or lumbar puncture, all components are accessible in primary care settings.</p>

<h2>Validation Results</h2>
<p>Validated on a cohort of 4,200 participants across 6 longitudinal studies, the algorithm demonstrated 94.2% sensitivity and 91.8% specificity for identifying individuals who went on to develop Alzheimer''s within 7 years.</p>

<h2>Clinical Pathway</h2>
<p>The tool is designed to flag high-risk patients for referral to neurologists and enrollment in prevention trials, rather than as a standalone diagnostic. Developers emphasize the importance of genetic counseling as part of the disclosure process.</p>',
    'neurology',
    ARRAY['alzheimers', 'artificial-intelligence', 'diagnosis', 'neurology', 'biomarkers'],
    'published',
    v_author_id,
    now() - interval '5 days'
  ),
  (
    'mRNA Vaccine Platform Shows Promise for Universal Influenza Immunisation',
    'mrna-universal-flu-vaccine',
    'Phase II data from a pandemic-preparedness mRNA vaccine candidate targeting conserved influenza antigens demonstrates broad cross-strain protection, potentially ending the era of annual flu shot reformulation.',
    '<h2>Background</h2>
<p>The seasonal influenza vaccine requires annual reformulation due to rapid viral evolution. An mRNA-based approach targeting the highly conserved stem region of hemagglutinin could offer durable, broad-spectrum protection.</p>

<h2>Trial Design</h2>
<p>The phase II study enrolled 840 healthy adults aged 18–70 across 14 sites in the United States and United Kingdom. Participants received either the investigational vaccine or standard quadrivalent seasonal flu vaccine.</p>

<h2>Efficacy Data</h2>
<p>Neutralising antibody titres against 11 diverse influenza A and B strains were significantly elevated in the mRNA arm at 28 days post-vaccination. Cross-reactive T-cell responses were also substantially higher compared to standard vaccine recipients.</p>

<h2>Next Steps</h2>
<p>A phase III efficacy trial is planned for the 2026 influenza season, with enrollment targeting 12,000 participants across multiple countries. Regulatory engagement with the FDA and EMA has begun.</p>',
    'immunology',
    ARRAY['mrna', 'influenza', 'vaccine', 'pandemic-preparedness', 'immunology'],
    'published',
    v_author_id,
    now() - interval '8 days'
  ),
  (
    'Global Antibiotic Resistance Crisis: New WHO Report Warns of Post-Antibiotic Era',
    'who-antibiotic-resistance-2025',
    'The World Health Organization''s latest antimicrobial resistance report projects 10 million annual deaths from drug-resistant infections by 2050, surpassing cancer mortality, without urgent coordinated action.',
    '<h2>The Scale of the Crisis</h2>
<p>Antimicrobial resistance (AMR) killed an estimated 1.27 million people globally in 2024 and was associated with nearly 5 million additional deaths. The WHO''s updated projections, incorporating genomic surveillance data from 185 countries, paint an alarming picture.</p>

<h2>Priority Pathogens</h2>
<p>Carbapenem-resistant Enterobacteriaceae, methicillin-resistant Staphylococcus aureus, and extensively drug-resistant Mycobacterium tuberculosis are identified as the most immediate threats, responsible for the majority of AMR-attributable mortality.</p>

<h2>Contributing Factors</h2>
<p>Overuse of antibiotics in agriculture accounts for 73% of global antibiotic consumption. Inadequate infection prevention and control in healthcare settings, combined with limited diagnostics in low-income countries, accelerates resistance spread.</p>

<h2>Proposed Solutions</h2>
<p>The report calls for mandatory antibiotic stewardship programmes, increased R&D incentives through push-pull funding mechanisms, and global surveillance infrastructure. A new Global AMR Fund with $10 billion initial capitalisation is proposed.</p>',
    'public-health',
    ARRAY['antibiotic-resistance', 'amr', 'who', 'public-health', 'policy'],
    'published',
    v_author_id,
    now() - interval '12 days'
  ),
  (
    'CRISPR Base Editing Corrects Sickle Cell Disease Mutation in 97% of Treated Cells',
    'crispr-base-editing-sickle-cell',
    'A single intravenous infusion of ex vivo CRISPR base-edited haematopoietic stem cells achieved near-complete correction of the pathogenic HbS mutation in a phase I/II trial, with all 12 patients becoming transfusion-independent.',
    '<h2>Disease Overview</h2>
<p>Sickle cell disease (SCD) affects approximately 7 million people worldwide and is caused by a single-nucleotide variant in the beta-globin gene (HBB). Until recently, curative options were limited to allogeneic stem cell transplantation, which carries substantial morbidity and requires matched donors.</p>

<h2>The Editing Approach</h2>
<p>Researchers used adenine base editing (ABE) to directly convert the pathogenic A-to-T HbS mutation back to the wild-type sequence in autologous CD34+ haematopoietic stem and progenitor cells. This single-base correction eliminates polymerisation of deoxygenated haemoglobin, the root cause of sickling.</p>

<h2>Clinical Results</h2>
<p>All 12 patients enrolled in the first-in-human trial achieved haemoglobin levels above 10 g/dL at 12 months. No vaso-occlusive crises were reported post-infusion. Edited allele frequencies in peripheral blood ranged from 89–97%.</p>

<h2>Safety and Durability</h2>
<p>No off-target editing events were detected using unbiased genome-wide assays. Four patients have now reached 24 months of follow-up with sustained correction, suggesting durable engraftment of edited cells.</p>',
    'research',
    ARRAY['crispr', 'gene-therapy', 'sickle-cell', 'haematology', 'base-editing'],
    'published',
    v_author_id,
    now() - interval '15 days'
  ),
  (
    'Draft: Gut Microbiome and Cardiovascular Disease Link Strengthened in Prospective Cohort',
    'gut-microbiome-cardiovascular-draft',
    'A 10-year prospective study of 45,000 participants confirms that specific gut microbiome signatures predict major adverse cardiovascular events independently of traditional risk factors.',
    '<h2>Study Design</h2>
<p>The MICROHEART study followed 45,238 participants free of cardiovascular disease at enrollment. Baseline stool microbiome profiling used shotgun metagenomic sequencing.</p>',
    'cardiology',
    ARRAY['microbiome', 'cardiovascular', 'cardiology', 'gut-health'],
    'draft',
    v_author_id,
    NULL
  )
  ON CONFLICT (slug) DO NOTHING;

  RAISE NOTICE 'Seed data inserted successfully for user: %', v_author_id;
END $$;
