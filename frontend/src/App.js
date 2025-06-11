import React, { useState } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  Box, 
  Stepper, 
  Step, 
  StepLabel,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import FileUpload from './components/FileUpload';
import ProcessFile from './components/ProcessFile';
import Results from './components/Results';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const steps = ['Upload File', 'Process File', 'View Results'];

function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setUploadedFile(null);
    setProcessingStatus('idle');
    setResults(null);
    setError(null);
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
  };

  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <FileUpload 
            onFileUploaded={(file) => {
              setUploadedFile(file);
              setError(null);
              handleNext();
            }}
          />
        );
      case 1:
        return (
          <ProcessFile 
            file={uploadedFile}
            onProcessingComplete={(data) => {
              setResults(data);
              setError(null);
              handleNext();
            }}
            onProcessingError={handleError}
          />
        );
      case 2:
        return (
          <Results 
            results={results}
            onReset={handleReset}
          />
        );
      default:
        return 'Unknown step';
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md">
        <Box sx={{ my: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Law QA System
          </Typography>
          
          <Paper sx={{ p: 3, mb: 3 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Paper>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Paper sx={{ p: 3 }}>
            {getStepContent(activeStep)}
          </Paper>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 