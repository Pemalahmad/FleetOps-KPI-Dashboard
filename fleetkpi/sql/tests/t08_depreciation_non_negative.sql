-- description: Monthly depreciation is never negative
-- severity: error
SELECT month_start, powertrain FROM mart_asset_value_monthly WHERE depreciation < 0
