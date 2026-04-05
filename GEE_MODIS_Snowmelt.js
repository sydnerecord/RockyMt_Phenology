// Google Earth Engine script to generate annual snowmelt timing (2019-2025)
// Based on the methodology from "Snowmelt Timing Maps Derived from MODIS for North America, Version 2"

var startYear = 2019;
var endYear = 2025;

// Define the geographical region of interest (North America bounds from the paper)
// Westernmost: -180, Easternmost: 0, Northernmost: 90, Southernmost: 10
var roi = ee.Geometry.Polygon([[
  [-180, 10], [-180, 90], [0, 90], [0, 10], [-180, 10]
]], null, false); 

// MODIS Terra 8-Day Snow Cover 500m (Collection 6.1)
var modisSnow = ee.ImageCollection('MODIS/061/MOD10A2');

// Function to calculate snowmelt timing for a given year
var calculateSnowmeltTiming = function(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = ee.Date.fromYMD(year, 9, 9); // The defined snowmelt period 
  
  // Filter collection for the year
  var yearlyCol = modisSnow.filterDate(startDate, endDate)
                           .select('Maximum_Snow_Extent')
                           .sort('system:time_start');

  // Convert each image to a standardized format matching MODIS QA classes
  var classifySnow = function(img) {
    var maxSnow = img.select('Maximum_Snow_Extent');
    var doy = ee.Number.parse(img.date().format('D')); 
    
    var snow = maxSnow.eq(200);   // Snow class
    var noSnow = maxSnow.eq(25);  // Land/No Snow class
    var cloud = maxSnow.eq(50);   // Cloud class
    
    var doyBand = ee.Image.constant(doy).rename('DOY').toInt16();
    
    return ee.Image().addBands([
      snow.rename('is_snow'),
      noSnow.rename('is_no_snow'),
      cloud.rename('is_cloud'),
      doyBand
    ]).set('system:time_start', img.get('system:time_start'));
  };

  var classifiedCol = yearlyCol.map(classifySnow);
  
  // Set up an iteration state image to track consecutive observations across the time-series
  var initialState = ee.Image.constant([0, 0, 0, 0])
    .rename(['snow_count', 'cloud_count', 'first_cloud_doy', 'snowmelt_doy'])
    .toInt16();

  var findSnowmelt = function(currentImg, stateImg) {
    stateImg = ee.Image(stateImg);
    
    var isSnow = currentImg.select('is_snow');
    var isNoSnow = currentImg.select('is_no_snow');
    var isCloud = currentImg.select('is_cloud');
    var doy = currentImg.select('DOY');
    
    var snowCount = stateImg.select('snow_count');
    var cloudCount = stateImg.select('cloud_count');
    var firstCloudDoy = stateImg.select('first_cloud_doy');
    var snowmeltDoy = stateImg.select('snowmelt_doy');
    
    // Check if snowmelt was already identified in a previous iteration
    var alreadyFound = snowmeltDoy.gt(0);
    
    // Condition 1: Snow is present
    var newSnowCount = snowCount.add(1).multiply(isSnow).add(snowCount.multiply(isSnow.not()));
    
    // Condition 2: Cloud is present 
    var validSnowHistory = newSnowCount.gte(2); // Require 2 prior snow observations
    var isCloudAfterSnow = isCloud.and(validSnowHistory);
    var newCloudCount = cloudCount.add(1).multiply(isCloudAfterSnow).add(cloudCount.multiply(isCloudAfterSnow.not()));
    
    var setFirstCloud = isCloudAfterSnow.and(newCloudCount.eq(1));
    var newFirstCloudDoy = doy.multiply(setFirstCloud).add(firstCloudDoy.multiply(setFirstCloud.not()));
    
    // Condition 3: No Snow is present (Melt evaluation)
    var directMelt = isNoSnow.and(validSnowHistory).and(newCloudCount.eq(0));
    var cloudMelt = isNoSnow.and(validSnowHistory).and(newCloudCount.gt(0));
    
    // Interpolate DOY if clouded
    var interpolatedDoy = newFirstCloudDoy.add(doy).divide(2).toInt16();
    
    var finalMeltDoy = snowmeltDoy
      .where(directMelt.and(alreadyFound.not()), doy)
      .where(cloudMelt.and(alreadyFound.not()), interpolatedDoy);
      
    // Reset consecutive counts if it is currently clear (no snow)
    newSnowCount = newSnowCount.where(isNoSnow, 0);
    newCloudCount = newCloudCount.where(isNoSnow, 0);

    return stateImg.addBands([
      newSnowCount.rename('snow_count'),
      newCloudCount.rename('cloud_count'),
      newFirstCloudDoy.rename('first_cloud_doy'),
      finalMeltDoy.rename('snowmelt_doy')
    ], null, true); 
  };

  // Iterate over the chronological collection
  var finalState = ee.Image(classifiedCol.iterate(findSnowmelt, initialState));
  
  // Return the identified DOY, masking out 0s (never melted / persistent snow)
  var meltImg = finalState.select('snowmelt_doy');
  return meltImg.updateMask(meltImg.gt(0))
                .rename('Snowmelt_DOY')
                .set('year', year);
};

// Apply function over the defined years
var years = ee.List.sequence(startYear, endYear);
var snowmeltImages = ee.ImageCollection.fromImages(years.map(calculateSnowmeltTiming));

// Calculate a multi-year mean and render it on the map
var meanSnowmelt = snowmeltImages.mean().clip(roi);

Map.centerObject(roi, 3);
Map.addLayer(meanSnowmelt, {min: 1, max: 249, palette: ['0000FF', '00FFFF', 'FFFFFF']}, 'Mean Snowmelt DOY 2019-2025');

// ==============================================================================
// UPDATED: Loop through each year and create a separate export task
// ==============================================================================

for (var y = startYear; y <= endYear; y++) {
  // Filter the collection to get the specific year's image
  var yearlyImage = ee.Image(snowmeltImages.filter(ee.Filter.eq('year', y)).first());
  
  Export.image.toDrive({
    image: yearlyImage,
    description: 'Snowmelt_Timing_North_America_' + y, // Dynamically names the task
    folder: 'snowmelt', // Puts all exports in a specific Drive folder
    scale: 500,
    region: roi,
    maxPixels: 1e13
  });
}