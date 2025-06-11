import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, CircularProgress } from '@mui/material';
import axios from 'axios';

const ProcessFile = ({ file, onProcessingComplete, onProcessingError }) => {
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filePath, setFilePath] = useState('');

  useEffect(() => {
    const uploadFile = async () => {
      try {
        setLoading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post('http://localhost:8000/uploadVBNB', formData);
        
        if (response.data && response.data.file_path) {
          setFilePath(response.data.file_path);
        } else {
          throw new Error('Không nhận được đường dẫn file từ server');
        }
      } catch (err) {
        let errorMessage = 'Có lỗi xảy ra khi upload file';
        if (err.response && err.response.data) {
          if (typeof err.response.data === 'string') {
            errorMessage = err.response.data;
          } else if (err.response.data.detail) {
            errorMessage = err.response.data.detail;
          }
        }
        setError(errorMessage);
        onProcessingError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    uploadFile();
  }, [file, onProcessingError]);

  const handleProcess = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!filePath) {
        throw new Error('Chưa có đường dẫn file');
      }
      const processResponse = await axios.post(`http://localhost:8000/process`, null, {
        params: {
          file_path: filePath,
          start_page: startPage,
          end_page: endPage
        }
      });
      

      if (processResponse.data) {
        onProcessingComplete(processResponse.data);
      } else {
        throw new Error('Không nhận được dữ liệu từ server');
      }
    } catch (err) {
      let errorMessage = 'Có lỗi xảy ra trong quá trình xử lý';
      if (err.response && err.response.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.detail) {
          errorMessage = err.response.data.detail;
        }
      }
      setError(errorMessage);
      onProcessingError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Xử lý file: {file.name}
      </Typography>

      <Box sx={{ mb: 3 }}>
        <TextField
          label="Trang bắt đầu"
          type="number"
          value={startPage}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (value >= 1) {
              setStartPage(value);
            }
          }}
          inputProps={{ min: 1 }}
          sx={{ mr: 2 }}
        />
        <TextField
          label="Trang kết thúc"
          type="number"
          value={endPage}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (value >= startPage) {
              setEndPage(value);
            }
          }}
          inputProps={{ min: startPage }}
        />
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Button
        variant="contained"
        onClick={handleProcess}
        disabled={loading || !filePath}
        sx={{ mt: 2 }}
      >
        {loading ? (
          <>
            <CircularProgress size={24} sx={{ mr: 1 }} />
            Đang xử lý...
          </>
        ) : (
          'Bắt đầu xử lý'
        )}
      </Button>
    </Box>
  );
};

export default ProcessFile;