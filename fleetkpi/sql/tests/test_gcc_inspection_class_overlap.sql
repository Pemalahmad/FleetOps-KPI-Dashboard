-- description: Official registration aliases must resolve to one inspection rule within each country
WITH aliases AS (
    SELECT country_code, class_rule, unnest(regexp_split_to_array(aliases, '[|]')) AS alias_pattern
    FROM stg_gcc_inspection_classes
)
SELECT country_code, alias_pattern FROM aliases WHERE regexp_full_match(alias_pattern, '[a-z ]+|[ا-ي ]+')
GROUP BY ALL HAVING count(DISTINCT class_rule) > 1
