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
  Card,
  CardContent,
  Tabs,
  Tab,
  Divider,
} from '@mui/material';
import { Delete as DeleteIcon, CloudUpload as CloudUploadIcon, PlayArrow as PlayIcon, Close as CloseIcon, Visibility as VisibilityIcon, Download as DownloadIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: number;
}

interface Document {
  title: string;
  text: string | null;
}

interface Documents {
  [key: string]: Document[];
}

interface ProcessResult {
  question: string;
  answer: string;
  documents: Documents;
}

interface ResultFile {
  filename: string;
  modified_time: number;
  timestamp: string;
}

const UserPage: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [resultFiles, setResultFiles] = useState<ResultFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedFileForProcess, setSelectedFileForProcess] = useState<string | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [processingResults, setProcessingResults] = useState<ProcessResult[]>([]);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);

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

  const fetchResultFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/process-results');
      setResultFiles(response.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch result files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchResultFiles();
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
    if (newValue === 1) { // Tab kết quả xử lý
      fetchResultFiles();
    }
  };

  const handleViewResults = async (filename: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:8000/process-results/${filename}`);
      if (response.data && response.data.results && Array.isArray(response.data.results)) {
        setProcessingResults(response.data.results);
        setResultsDialogOpen(true);
      } else {
        setError('No results found');
      }
    } catch (err) {
      console.error('Error fetching result details:', err);
      setError('Failed to fetch result details');
    } finally {
      setLoading(false);
    }
  };

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

      setProcessingResults(response.data.results);
      setSuccess('File processed successfully');
      setProcessDialogOpen(false);
      setResultsDialogOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process file');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseResultsDialog = () => {
    setResultsDialogOpen(false);
    setProcessingResults([]);
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

  const handleDownloadDocx = async (filename: string) => {
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:8000/generate-docx', {
        filename: filename
      }, {
        responseType: 'blob'
      });
      
      // Tạo URL từ blob
      const url = window.URL.createObjectURL(new Blob([response.data]));
      // Tạo link tải xuống
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename.replace('.json', '')}.docx`);
      document.body.appendChild(link);
      link.click();
      // Cleanup
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading DOCX:', err);
      setError('Failed to download DOCX file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Xử lý văn bản
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
            Chọn file
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
            Tải lên
          </Button>
        </Box>

        {selectedFiles.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Các file đã chọn:
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
                        ? `Tiến trình: ${uploadProgress[file.name]}%`
                        : 'Sẵn sàng tải lên'
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

      <Paper sx={{ p: 2 }}>
        <Tabs value={currentTab} onChange={handleTabChange}>
          <Tab label="Danh sách file" />
          <Tab label="Kết quả xử lý" />
        </Tabs>

        {currentTab === 0 ? (
          <>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Danh sách file
            </Typography>
            {loading ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên file</TableCell>
                      <TableCell>Kích thước</TableCell>
                      <TableCell>Ngày sửa đổi</TableCell>
                      <TableCell align="right">Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.path}>
                        <TableCell>{file.name}</TableCell>
                        <TableCell>{formatFileSize(file.size)}</TableCell>
                        <TableCell>{formatDate(file.modified)}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            onClick={() => {
                              setSelectedFileForProcess(file.path);
                              setProcessDialogOpen(true);
                            }}
                            color="primary"
                          >
                            <PlayIcon />
                          </IconButton>
                          <IconButton
                            onClick={() => handleDelete(file.path)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        ) : (
          <>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Kết quả xử lý
            </Typography>
            {loading ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên file</TableCell>
                      <TableCell>Thời gian xử lý</TableCell>
                      <TableCell align="right">Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resultFiles.map((file) => (
                      <TableRow key={file.filename}>
                        <TableCell>{file.filename}</TableCell>
                        <TableCell>{formatDate(file.modified_time)}</TableCell>
                        <TableCell align="right">
                          <Box>
                            <IconButton
                              edge="end"
                              aria-label="view"
                              onClick={() => handleViewResults(file.filename)}
                              sx={{ mr: 1 }}
                            >
                              <VisibilityIcon />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="download"
                              onClick={() => handleDownloadDocx(file.filename)}
                            >
                              <DownloadIcon />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Paper>

      <Dialog open={processDialogOpen} onClose={() => setProcessDialogOpen(false)}>
        <DialogTitle>Xử lý file</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              label="Trang bắt đầu"
              type="number"
              value={startPage}
              onChange={(e) => setStartPage(Number(e.target.value))}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Trang kết thúc"
              type="number"
              value={endPage}
              onChange={(e) => setEndPage(Number(e.target.value))}
              fullWidth
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProcessDialogOpen(false)}>Hủy</Button>
          <Button onClick={handleProcess} color="primary" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Xử lý'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={resultsDialogOpen}
        onClose={handleCloseResultsDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: '80vh',
          },
        }}
      >
        <DialogTitle>
          Kết quả xử lý
          <IconButton
            aria-label="close"
            onClick={handleCloseResultsDialog}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : processingResults.length > 0 ? (
            <Box>
              {processingResults.map((result, index) => (
                <Box key={index} sx={{ mb: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    Câu hỏi {index + 1}
                  </Typography>
                  <Typography variant="body1" paragraph>
                    {result.question}
                  </Typography>

                  <Typography variant="h6" gutterBottom>
                    Câu trả lời
                  </Typography>
                  <Box sx={{ 
                    '& p': { mb: 2 },
                    '& ul': { pl: 2, mb: 2 },
                    '& li': { mb: 1 },
                    '& strong': { fontWeight: 'bold' }
                  }}>
                    <ReactMarkdown>
                      {result.answer}
                    </ReactMarkdown>
                  </Box>

                  {result.documents && Object.keys(result.documents).length > 0 && (
                    <>
                      <Typography variant="h6" gutterBottom>
                        Tài liệu tham khảo
                      </Typography>
                      {Object.entries(result.documents).map(([source, docs]) => (
                        <Box key={source} sx={{ mb: 3 }}>
                          <Typography variant="subtitle1" color="primary" gutterBottom>
                            {source}
                          </Typography>
                          <List dense>
                            {docs.map((doc, docIndex) => (
                              <ListItem key={docIndex}>
                                <ListItemText
                                  primary={doc.title}
                                  secondary={doc.text || 'Không có nội dung'}
                                />
                              </ListItem>
                            ))}
                          </List>
                          <Divider />
                        </Box>
                      ))}
                    </>
                  )}
                  {index < processingResults.length - 1 && <Divider sx={{ my: 3 }} />}
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body1" color="text.secondary">
              Không có kết quả
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseResultsDialog}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UserPage; 