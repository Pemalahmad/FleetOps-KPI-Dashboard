-- description: Exact Arabic and English registration-card aliases grouped by the applicable inspection rule. Classes are jurisdiction-specific and never inferred from model, driver licence or operating description.
-- materialized: table
SELECT * FROM (VALUES
    ('AE', 'ae_private_light', 'private light vehicle|light private vehicle|private( passenger)? car|light vehicle private|مركبة خفيفة خاصة|مركبة خاصة خفيفة|مركبة خفيفة خصوصي|سيارة خاصة'),
    ('AE', 'ae_light', 'light vehicle|light (commercial|goods) vehicle|commercial light vehicle|light truck|مركبة خفيفة|مركبة تجارية خفيفة|شاحنة خفيفة'),
    ('AE', 'ae_light_service', 'taxi|rental car|rental light vehicle|ليموزين|أجرة|سيارة أجرة|تأجير|سيارة تأجير'),
    ('AE', 'ae_other', 'heavy (vehicle|truck|bus)|truck|(private |public |light |school )?bus|motorcycle|mechanical (equipment|tractor)|' ||
        'trailer|semi[ -]trailer|مركبة ثقيلة|شاحنة ثقيلة|شاحنة|حافلة( خفيفة| ثقيلة| مدرسية| خاصة| عامة)?|دراجة نارية|دراجة آلية|جهاز ميكانيكي|مقطورة|شبه مقطورة'),
    ('AE', 'ae_confirmation', 'private|خصوصي|خصوصى|commercial|تجاري|تجارى|temporary|export|تصدير|مؤقت|classic|كلاسيكية'),
    ('SA', 'sa_private', 'private( car| vehicle)?|private registration|خاص[ةه]?|خصوصي|خصوصى|رخصة سير خاصة|سيارة خاصة'),
    ('SA', 'sa_public', 'taxi|public bus|public transport( vehicle)?|public (goods )?truck|أجرة|سيارة أجرة|حافلة عامة|نقل عام|رخصة سير (سيارة أجرة|حافلة عامة|نقل عام)'),
    ('SA', 'sa_confirmation', 'private (goods |road )?transport( vehicle)?|private (bus|truck)|motorcycle|public works( vehicle)?|trailer|semi[ -]trailer|rental car|' ||
        'نقل خاص|نقل خاصة|حافلة خاصة|دراجة آلية|مركبة أشغال عامة|مركبة أشغال العامة|مقطورة|شبه مقطورة|سيارة تأجير|' ||
        'رخصة سير (نقل خاص[ةه]?|حافلة خاصة|دراجة آلية|مركبة أشغال (العامة|عامة))'),
    ('QA', 'qa_private', 'private( car| vehicle| passenger car)?|خصوصي|خصوصى|خاصة|سيارة خاصة|سيارات خاصة'),
    ('QA', 'qa_private_transport', 'private (trans|transport|truck)|private transport (vehicle|truck)|private transport vehicle \(truck\)|نقل خاص|سيارة نقل خاص'),
    ('QA', 'qa_renewal', 'taxi|rental car|limousine|motorcycle|public transport( vehicle| truck)?|public transport vehicle \(truck\)|public truck|private bus|public bus|tourist bus|school bus|' ||
        'trailer|semi[ -]trailer|special[ -](use|purpose)( vehicle)?|heavy machinery|tractor|أجرة|سيارة أجرة|سيارة تأجير|ليموزين|دراجة آلية|' ||
        'نقل عام|سيارة نقل عام|باص (خاص|عام|سياحي)|حافلة( خاصة| عامة| مدرسية| سياحية)?|مقطورة|نصف مقطورة|شبه مقطورة|معدة|سيارة ذات استعمال خاص'),
    ('QA', 'qa_confirmation', 'government(al)?( vehicle)?|gov\.?|armed forces|police|commercial plates|export|حكومي|حكومية|شرطة|القوات المسلحة|لوحات تجارية|تصدير'),
    ('KW', 'kw_private', 'private( car| vehicle| saloon)?|private motorcycle|motorcycle|خصوصي|خصوصى|سيارة خاصة|صالون( خاص)?|دراجة آلية خاصة|دراجة آلية'),
    ('KW', 'kw_private_transport', 'private (light )?transport( vehicle)?|light private transport|private truck|نقل خاص|نقل خاص خفيف|نقل خفيف خاص|سيارة نقل خاص خفيفة|نقل مشترك'),
    ('KW', 'kw_renewal', 'taxi|public transport|passenger transport vehicle|rental car|bus|public bus|light transport|medium transport|heavy transport|truck|commercial( vehicle)?|' ||
        'tractor|special[ -]purpose vehicle|trailer|semi[ -]trailer|driving school vehicle|أجرة|سيارة أجرة|نقل عام|سيارة نقل ركاب|حافلة|نقل خفيف|نقل متوسط|نقل ثقيل|' ||
        'شاحنة|مركبة نشاط تجاري|مركبة تعليم قيادة|مقطورة|شبه مقطورة|جرار'),
    ('OM', 'om_age', 'private( car| vehicle| motorcycle| pickup)?|motorcycle|government light (car|vehicle)|خاص[ةه]?|خصوصي|خصوصى|سيارة خاصة|دراجة آلية|مركبة حكومية خفيفة|بيك[ -]?أ?ب خاص'),
    ('OM', 'om_light_commercial', 'commercial (pickup|light passenger vehicle)|light commercial passenger vehicle|pickup( truck)?|بيك[ -]?أ?ب|بيك[ -]?أ?ب تجاري|مركبة ركاب خفيفة تجارية|شاحنة صغيرة'),
    ('OM', 'om_renewal', 'taxi|driving school (car|vehicle)|training (car|vehicle)|(private |public |school )?bus|heavy (truck|commercial vehicle)|' ||
        'government (heavy (vehicle|truck)|equipment)|limited use( vehicle)?|commercial (truck|equipment|trailer)|' ||
        'سيارة أجرة|أجرة|سيارة تعليم|مركبة تعليم|حافلة( خاصة| عامة| مدرسية)?|شاحنة ثقيلة|مركبة حكومية ثقيلة|معدة حكومية|مركبة محدودة الاستخدام|شاحنة تجارية|معدة تجارية|مقطورة تجارية'),
    ('OM', 'om_confirmation', 'commercial( vehicle)?|government(al)?( vehicle)?|تجاري|تجارى|مركبة تجارية|حكومي|حكومية|مركبة حكومية|tractor|جرار')
) AS t(country_code, class_rule, aliases)
