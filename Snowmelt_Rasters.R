#############################################################################################################
# The purpose of this script is to generate date of first snowmelt rasters from MODIS data (2001-2026).
# These data will are intended for subsequent plant phenological analyses.
# Sydne Record
# April 2026
##############################################################################################################

# Specify root folder for inputs and outputs 
root_folder <- 'G:/Shared drives/MSB_Phenology/RockyMt'
# Set your working directory to the root folder
setwd(file.path(root_folder))
# Define a file path for exporting from this script. 
#export_path <- file.path('G:/Shared drives/MSB_Phenology/RockyMt_Phenology/output_data/') 
# Define a file path for importing data into your R session. 
#data_path <- file.path('G:/Shared drives/MSB_Phenology/RockyMt_Phenology/input_data/')

# Load necessary packages 
library(sf)
library(tidyverse)
library(terra)

#Read in Rocky Mt shapefile
RM_shape <- read_sf("input_data/RockyMtShapefile/rocky-mountain-range-area_838-polygon.shp")

# Read in herbarium data
herbarium <- read.csv('input_data/data_phenology_herbarium.csv')

# Determine projection of RM shapefile
st_crs(RM_shape)

# Convert longitude & latitude columns from herbarium data .csv into spatial object for visualization
sf_points <- st_as_sf(herbarium, coords = c("Longitude", "Latitude"), crs = 4326)

# Visualize herbarium sampling points on RM shapefile to ensure that shapefile is appropriate for cropping MODIS data
# Plot shapefile first (use $geometry to plot only the shapes, not attributes)
plot(st_geometry(RM_shape))

# Overlay points
plot(st_geometry(sf_points), add = TRUE, col = "blue", pch = 19)

# Determine extent of RM shapefile to determine extent of MODIS data to retrieve
st_bbox(RM_shape)

#xmin       ymin       xmax       ymax 
#-125.84455   35.37196 -104.42414   60.07528 

# Read in MODIS snowmelt timing maps from 2001-2018
# https://doi.org/10.3334/ORNLDAAC/1712

# Get a list of all .tif files in the folder
file_list_2001_2018 <- list.files(path = "G:/Shared drives/MSB_Phenology/RockyMt/input_data/Snowmelt_timing_maps_2001_2018/data/", 
                        pattern = "\\.tif$", 
                        full.names = TRUE)

# Create the SpatRaster stack
snowmelt01_18_stack <- rast(file_list_2001_2018)

# Read in snowmelt maps generated in Google Earth Engine from MODIS data from 2019-2025
# Get a list of all .tif files in the folder
file_list_2019_2025 <- list.files(path = "G:/Shared drives/MSB_Phenology/RockyMt/input_data/Snowmelt_timing_maps_2019_2025", 
                                  pattern = "\\.tif$", 
                                  full.names = TRUE)

# Create the SpatRaster stack
snowmelt19_25_stack <- rast(file_list_2019_2025)

# Project rasters to have the same resolution and crs
# For overlapping cells, this uses a bilinear interpolation (3x3 cell window). Note this results in DOY values that are not whole integers, so we round subsequently to get back to whole integers for DOY values.
snowmelt01_18_stack <- project(snowmelt01_18_stack, snowmelt19_25_stack[[1]])
# Round values to get whole integer DOY values.
snowmelt01_18_stack <- round(snowmelt01_18_stack)

# crop snowmelt rasters to extent of Rocky Mountains
snowmelt19_25_stack_RM <- crop(snowmelt19_25_stack, st_bbox(RM_shape))
snowmelt01_18_stack_Rm <- crop(snowmelt01_18_stack, st_bbox(RM_shape))

# replace zero values for DOY in 2019-2025 rasters to NA to match convention for 2001-2018 rasters
snowmelt19_25_stack_Rm <- subst(snowmelt19_25_stack_RM, 0, NA)

# stack together all years 2001-2025
snowmelt01_25_RM <- c(snowmelt01_18_stack_Rm, snowmelt19_25_stack_Rm)

# Add names to last six layers 
names(snowmelt01_25_RM)[19:25] <- c("Snowmelt_North_America_2019", "Snowmelt_North_America_2020", "Snowmelt_North_America_2021", "Snowmelt_North_America_2022", "Snowmelt_North_America_2023", "Snowmelt_North_America_2024", "Snowmelt_North_America_2025")

# export raster stack
writeRaster(snowmelt01_25_RM, filename="output_data/snowmelt01_25_updated.tif", overwrite=TRUE)



############## Read raster stack back in and extract herbarium points
# Read back in snowmelt01_25_RM raster stack
snowmelt <- rast('output_data/snowmelt01_25.tif')

# Extract data for each year from raster stack of snowmelt values for herbarium point locations
herbvalues <- terra::extract(snowmelt, sf_points, xy=TRUE)

# Write herbarium point values for snowmelt by year to .csv
write.csv(herbvalues, "output_data/herbvalues_snowmelt.csv")


