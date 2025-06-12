import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Grid,
} from '@mui/material';
import axios from 'axios';

const ProcessFile: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [filePath, setFilePath] = useState('');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(
        'http://localhost:8000/process',
        {
          file_path: filePath,
          start_page: startPage,
          end_page: endPage,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Navigate to results page with the timestamp
      navigate('/results');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred while processing the file');
      console.error('Error processing file:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Process File
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={3} sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="File Path"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              required
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Start Page"
              value={startPage}
              onChange={(e) => setStartPage(parseInt(e.target.value))}
              inputProps={{ min: 1 }}
              required
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="End Page"
              value={endPage}
              onChange={(e) => setEndPage(parseInt(e.target.value))}
              inputProps={{ min: startPage }}
              required
            />
          </Grid>
          <Grid item xs={12}>
            <Button
              variant="contained"
              onClick={handleProcess}
              disabled={loading || !filePath || !startPage || !endPage}
              fullWidth
            >
              {loading ? <CircularProgress size={24} /> : 'Process File'}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ProcessFile;