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
} from '@mui/material';
import { Delete as DeleteIcon, CloudUpload as CloudUploadIcon, School as SchoolIcon } from '@mui/icons-material';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: number;
}

const AdminPage: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [learnDialogOpen, setLearnDialogOpen] = useState(false);
  const [selectedFileForLearn, setSelectedFileForLearn] = useState<string | null>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/files?directory=vbpl');
      setFiles(response.data.vbpl || []);
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

      // Upload each file sequentially
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);

        await axios.post('http://localhost:8000/uploadVBPL', formData, {
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

  const handleLearn = async (filePath: string) => {
    try {
      setLoading(true);
      await axios.post('http://localhost:8000/learn?file_path=' + filePath);
      setSuccess('File processed successfully');
      setLearnDialogOpen(false);
    } catch (err) {
      setError('Failed to process file');
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
        VBPL Management
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
                      setSelectedFileForLearn(file.path);
                      setLearnDialogOpen(true);
                    }}
                    title="Process for Learning"
                  >
                    <SchoolIcon />
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

      <Dialog open={learnDialogOpen} onClose={() => setLearnDialogOpen(false)}>
        <DialogTitle>Process File for Learning</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to process this file for learning? This may take some time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLearnDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => selectedFileForLearn && handleLearn(selectedFileForLearn)}
            color="primary"
            disabled={loading}
          >
            Process
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminPage; 