# Plot Analyzer

A data analysis application for processing and visualizing plot data from Excel files. Built as a fork of the BMS Analyzer with adaptations for different products and Excel formats.

## Current Status

✅ **Completed Setup:**
- Basic React/Vite application structure
- Core UI components and navigation
- File upload interface (framework ready)
- Basic data visualization framework
- Project structure matching original BMS Analyzer

⏳ **Next Steps Required:**
- Adapt parsers for new Excel format (`src/lib/parsers.js`)
- Update product-specific configurations (`src/lib/thresholds.js`)
- Implement data processing logic (`src/lib/processData.js`)
- Create web worker for file processing (`src/workers/plotWorker.js`)
- Customize charts for your data format (`src/components/charts/`)
- Update UI labels and terminology

## Project Structure

```
plot-analyzer/
├── src/
│   ├── components/
│   │   └── charts/          # Chart components (to be adapted)
│   ├── lib/
│   │   ├── parsers.js       # Excel parsing logic (needs adaptation)
│   │   ├── processData.js   # Data processing (needs adaptation)
│   │   └── thresholds.js    # Product config (needs adaptation)
│   ├── workers/
│   │   └── plotWorker.js    # Web worker (needs creation)
│   ├── App.jsx              # Main application (basic structure ready)
│   ├── main.jsx             # React entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── package.json             # Dependencies
├── vite.config.js          # Vite configuration
└── README.md               # This file
```

## Getting Started

1. **Install dependencies:**
   ```bash
   cd plot-analyzer
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

## Key Adaptations Needed

### 1. Excel Format Analysis
- Examine your Excel file structure and column headers
- Identify data fields and their positions
- Document sheet names and data formats

### 2. Parser Updates (`src/lib/parsers.js`)
```javascript
// TODO: Implement parsing for your Excel format
function parsePlotData(rows, sheetName) {
  // Adapt column mappings for your data
  return rows.map(row => ({
    timestamp: row['Time'] || row['Timestamp'],
    value: row['Value'] || row['Data'],
    // ... other fields
  }));
}
```

### 3. Product Configuration (`src/lib/thresholds.js`)
```javascript
// TODO: Update for your product
export const PLOT_THRESHOLDS = {
  maxValue: 100,      // Adjust based on your data range
  minValue: 0,        // Adjust based on your data range
  warningThreshold: 80, // Product-specific thresholds
  // ... other product-specific settings
};
```

### 4. Chart Components
- Update chart data mappings
- Adapt visualization for your data types
- Modify axis labels and formatting

### 5. Web Worker (`src/workers/plotWorker.js`)
- Implement file parsing logic
- Handle data transformation
- Add error handling for your file format

## Development Guidelines

- Keep the same component structure as the original BMS Analyzer
- Maintain consistent UI/UX patterns
- Update terminology to match your product domain
- Preserve performance optimizations (downsampling, memoization)

## Testing

- Test with sample Excel files from your product
- Verify data accuracy and chart rendering
- Check performance with large datasets
- Validate error handling for malformed files

## Deployment

Once adapted, build and deploy like any standard React application:

```bash
npm run build
# Deploy the dist/ folder to your web server
```

## Support

This application is built on the foundation of the BMS Analyzer. Refer to the original project for additional implementation details and best practices.
