import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  TextField,
} from '@mui/material';
import { Delete as DeleteIcon, CloudUpload as CloudUploadIcon, PlayArrow as PlayIcon } from '@mui/icons-material';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: number;
}

const UserPage: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedFileForProcess, setSelectedFileForProcess] = useState<string | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [processingResults, setProcessingResults] = useState<any>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/files?directory=temp');
      setFiles(response.data.temp || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setLoading(true);
      setUploadProgress({});

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);

        await axios.post('http://localhost:8000/uploadVBNB', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: progress
            }));
          },
        });
      }

      setSuccess('Files uploaded successfully');
      setSelectedFiles([]);
      setUploadProgress({});
      await fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload files');
      console.error(err);
    } finally {
      setLoading(false);
      setUploadProgress({});
    }
  };

  const handleDelete = async (filePath: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      setLoading(true);
      await axios.delete(`http://localhost:8000/files?path=${encodeURIComponent(filePath)}`);
      setSuccess('File deleted successfully');
      fetchFiles();
    } catch (err) {
      setError('Failed to delete file');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!selectedFileForProcess) return;

    try {
      setLoading(true);
      const response = await axios.post('http://localhost:8000/process', null, {
        params: {
          file_path: selectedFileForProcess,
          start_page: startPage,
          end_page: endPage
        }
      });

      setProcessingResults(response.data);
      setSuccess('File processed successfully');
      setProcessDialogOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process file');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Document Processing
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
            disabled={loading}
          >
            Select Files
            <input
              type="file"
              hidden
              onChange={handleFileSelect}
              accept=".pdf,.docx"
              multiple
            />
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || loading}
          >
            Upload All
          </Button>
        </Box>

        {selectedFiles.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Selected Files:
            </Typography>
            <List>
              {selectedFiles.map((file, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton edge="end" onClick={() => removeSelectedFile(index)}>
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={file.name}
                    secondary={
                      uploadProgress[file.name] !== undefined
                        ? `Upload Progress: ${uploadProgress[file.name]}%`
                        : 'Ready to upload'
                    }
                  />
                  {uploadProgress[file.name] !== undefined && (
                    <CircularProgress
                      variant="determinate"
                      value={uploadProgress[file.name]}
                      size={24}
                      sx={{ ml: 2 }}
                    />
                  )}
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>File Name</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Last Modified</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.path}>
                <TableCell>{file.name}</TableCell>
                <TableCell>{formatFileSize(file.size)}</TableCell>
                <TableCell>{formatDate(file.modified)}</TableCell>
                <TableCell>
                  <IconButton
                    color="primary"
                    onClick={() => {
                      setSelectedFileForProcess(file.path);
                      setProcessDialogOpen(true);
                    }}
                    title="Process File"
                  >
                    <PlayIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    onClick={() => handleDelete(file.path)}
                    title="Delete"
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={processDialogOpen} onClose={() => setProcessDialogOpen(false)}>
        <DialogTitle>Process File</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              label="Start Page"
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
              label="End Page"
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProcessDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleProcess}
            disabled={loading}
            variant="contained"
          >
            {loading ? 'Processing...' : 'Process'}
          </Button>
        </DialogActions>
      </Dialog>

      {processingResults && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            Processing Results
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Processing Time: {processingResults.processing_time?.toFixed(2)} seconds
          </Typography>
          {processingResults.results?.map((result: any, index: number) => (
            <Box key={index} sx={{ mb: 2 }}>
              <Typography variant="subtitle1">
                <strong>Question {index + 1}:</strong> {result.question}
              </Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
                <strong>Answer:</strong> {result.answer}
              </Typography>
              {result.documents && result.documents.length > 0 && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>References:</strong>
                  <ul>
                    {result.documents.map((doc: string, docIndex: number) => (
                      <li key={docIndex}>{doc}</li>
                    ))}
                  </ul>
                </Typography>
              )}
            </Box>
          ))}
        </Paper>
      )}
    </Container>
  );
};

export default UserPage; 