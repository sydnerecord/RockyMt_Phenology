#############################################################################################################
# The purpose of this script is to generate date of first snowmelt rasters from MODIS data (2001-2026).
# These data will are intended for subsequent plant phenological analyses.
# Sydne Record
# April 2026
##############################################################################################################

# Specify root folder for inputs and outputs 
root_folder <- 'G:/Shared drives/MSB_Phenology/RockyMt_Phenology'
# Set your working directory to the root folder
setwd(file.path(root_folder))
# Define a file path for exporting from this script. 
export_path <- file.path('G:/Shared drives/MSB_Phenology/RockyMt_Phenology/output_data/') 
# Define a file path for importing data into your R session. 
data_path <- file.path('G:/Shared drives/MSB_Phenology/RockyMt_Phenology/input_data/')

# Load necessary packages 
library(sf)

#Read in Rocky Mt shapefile
RM_shape <- read_sf(file.path(data_path,"RockyMtShapefile/rocky-mountain-range-area_838-polygon.shp"))

# Read in herbarium data
herbarium <- read.csv(file.path(data_path,'data_phenology_herbarium.csv'))
