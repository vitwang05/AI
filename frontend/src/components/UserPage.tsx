import React, { useState, useEffect } from "react";
import axios from "axios";
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
  Select,
  MenuItem,
  FormControl,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  CloudUpload as CloudUploadIcon,
  PlayArrow as PlayIcon,
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";

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
  sentence: string;
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
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedFileForProcess, setSelectedFileForProcess] = useState<
    string | null
  >(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [processingResults, setProcessingResults] = useState<ProcessResult[]>(
    []
  );
  const [processingTime, setProcessingTime] = useState<number>(0);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<{[key: string]: boolean}>({});
  const [selectedProcessType, setSelectedProcessType] = useState<string>("1");
  const [expandedAccordion, setExpandedAccordion] = useState<string | false>(false);

  // Tạo instance axios với config mặc định
  const api = axios.create({
    baseURL: 'http://localhost:8000',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    }
  });

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await api.get("/files?directory=temp");
      setFiles(response.data.temp || []);
      setError(null);
    } catch (err) {
      setError("Failed to fetch files");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchResultFiles = async () => {
    try {
      setLoading(true);
      const response = await api.get("/process-results");
      setResultFiles(response.data || []);
      setError(null);
    } catch (err) {
      setError("Failed to fetch result files");
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
    setTimeout(() => {
      if (newValue === 0) {
        fetchFiles();
      } else if (newValue === 1) {
        fetchResultFiles();
      }
    }, 0);
  };

  const handleViewResults = async (filename: string) => {
    try {
      setLoading(true);
      const response = await api.get(`/process-results/${filename}`);
      if (
        response.data &&
        response.data.results &&
        Array.isArray(response.data.results)
      ) {
        setProcessingResults(response.data.results);
        setProcessingTime(response.data.process_time);
        console.log("Processing time:", response.data);
        setResultsDialogOpen(true);
      } else {
        setError("No results found");
      }
    } catch (err) {
      console.error("Error fetching result details:", err);
      setError("Failed to fetch result details");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setLoading(true);
      setUploadProgress({});

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        await api.post("/uploadVBNB", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            setUploadProgress((prev) => ({
              ...prev,
              [file.name]: progress,
            }));
          },
        });
      }

      setSuccess("Files uploaded successfully");
      setSelectedFiles([]);
      setUploadProgress({});
      await fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to upload files");
      console.error(err);
    } finally {
      setLoading(false);
      setUploadProgress({});
    }
  };

  const handleDelete = async (filePath: string) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;

    try {
      setLoading(true);
      await api.delete(`/files?path=${encodeURIComponent(filePath)}`);
      setSuccess("File deleted successfully");
      fetchFiles();
    } catch (err) {
      setError("Failed to delete file");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!selectedFileForProcess) return;

    try {
      setProcessingStatus(prev => ({
        ...prev,
        [selectedFileForProcess]: true
      }));
      setProcessDialogOpen(false);

      const processPromise = api.post("/process", null, {
        params: {
          file_path: selectedFileForProcess,
          start_page: startPage,
          end_page: endPage,
          process_type: selectedProcessType
        },
      });

      processPromise.then(response => {
        setProcessingResults(response.data.results);
        setProcessingTime(response.data.process_time);
        setSuccess("File processed successfully");
        setResultsDialogOpen(true);
      }).catch(err => {
        setError(err.response?.data?.detail || "Failed to process file");
        console.error(err);
      }).finally(() => {
        setProcessingStatus(prev => ({
          ...prev,
          [selectedFileForProcess]: false
        }));
      });

    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to process file");
      console.error(err);
      setProcessingStatus(prev => ({
        ...prev,
        [selectedFileForProcess]: false
      }));
    }
  };

  const handleCloseResultsDialog = () => {
    setResultsDialogOpen(false);
    setProcessingResults([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleDownloadDocx = async (filename: string) => {
    try {
      setLoading(true);
      const response = await api.post(
        "/generate-docx",
        {
          filename: filename,
        },
        {
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filename.replace(".json", "")}.docx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading DOCX:", err);
      setError("Failed to download DOCX file");
    } finally {
      setLoading(false);
    }
  };

  const handleAccordionChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedAccordion(isExpanded ? panel : false);
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
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
                    <IconButton
                      edge="end"
                      onClick={() => removeSelectedFile(index)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={file.name}
                    secondary={
                      uploadProgress[file.name] !== undefined
                        ? `Tiến trình: ${uploadProgress[file.name]}%`
                        : "Sẵn sàng tải lên"
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
                      <TableCell>Option</TableCell>
                      <TableCell align="right">Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.path}>
                        <TableCell>{file.name}</TableCell>
                        <TableCell>{formatFileSize(file.size)}</TableCell>
                        <TableCell>{formatDate(file.modified)}</TableCell>
                        <TableCell>
                          <FormControl size="small">
                            <Select
                              value={selectedProcessType}
                              onChange={(e) => setSelectedProcessType(e.target.value)}
                              sx={{ minWidth: 100 }}
                            >
                              <MenuItem value="1">Đánh giá chi tiết (điều luật)</MenuItem>
                              <MenuItem value="2">Phân loại văn bản</MenuItem>
                              <MenuItem value="3">Đánh giá chính tả</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {processingStatus[file.path] ? (
                              <CircularProgress size={24} />
                            ) : (
                              <IconButton
                                onClick={() => {
                                  setSelectedFileForProcess(file.path);
                                  setProcessDialogOpen(true);
                                }}
                                color="primary"
                              >
                                <PlayIcon />
                              </IconButton>
                            )}
                            <IconButton
                              onClick={() => handleDelete(file.path)}
                              color="error"
                            >
                              <DeleteIcon />
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

      <Dialog
        open={processDialogOpen}
        onClose={() => setProcessDialogOpen(false)}
      >
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
            {loading ? <CircularProgress size={24} /> : "Xử lý"}
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
            maxHeight: "80vh",
          },
        }}
      >
        <DialogTitle>
          Kết quả xử lý
          <IconButton
            aria-label="close"
            onClick={handleCloseResultsDialog}
            sx={{
              position: "absolute",
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
              {processingTime && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Thời gian xử lý: {processingTime.toFixed(2)} giây
                </Typography>
              )}
              {processingResults.slice(0, -1).map((result, index) => (
                <Accordion 
                  key={index} 
                  sx={{ mb: 2 }}
                  expanded={expandedAccordion === `panel${index}`}
                  onChange={handleAccordionChange(`panel${index}`)}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls={`panel${index}-content`}
                    id={`panel${index}-header`}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                      <Typography variant="h6">
                        Điều khoản đánh giá {index + 1}
                      </Typography>
                      {!expandedAccordion && (
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            maxWidth: '100%'
                          }}
                        >
                          {result.sentence ? result.sentence.split('\n').map((line, index) => (
                            <React.Fragment key={index}>
                              {line}
                              {index < result.sentence.split('\n').length - 1 && <br />}
                            </React.Fragment>
                          ))  : 'Không có nội dung'}
                        </Typography>
                      )}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body1" paragraph>
                      {result.sentence ? result.sentence.split('\n').map((line, index) => (
                        <React.Fragment key={index}>
                          {line}
                          {index < result.sentence.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      )) : 'No sentence content available'}
                    </Typography>

                    <Accordion sx={{ mb: 2 }}>
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls="panel-ai-answer"
                        id="panel-ai-answer-header"
                      >
                        <Typography 
                          variant="h6"
                          sx={{ 
                            color: 'primary.main',
                            fontWeight: 'bold',
                          }}
                        >
                          AI trả lời
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Box
                          sx={{
                            "& p": { mb: 2 },
                            "& ul": { pl: 2, mb: 2 },
                            "& li": { mb: 1 },
                            "& strong": { fontWeight: "bold" },
                          }}
                        >
                          <ReactMarkdown>{result.answer}</ReactMarkdown>
                        </Box>
                      </AccordionDetails>
                    </Accordion>

                    {result.documents &&
                      Object.keys(result.documents).length > 0 && (
                        <>
                          <Typography 
                            variant="h6" 
                            gutterBottom
                            sx={{ 
                              color: 'secondary.main',
                              fontWeight: 'bold',
                              borderBottom: '2px solid',
                              borderColor: 'secondary.main',
                              pb: 1,
                              mb: 2
                            }}
                          >
                            Tài liệu, điều luật tham khảo
                          </Typography>
                          {Object.entries(result.documents).map(
                            ([source, docs]) => (
                              <Accordion key={source} sx={{ mb: 1 }}>
                                <AccordionSummary
                                  expandIcon={<ExpandMoreIcon />}
                                  aria-controls={`panel-${source}`}
                                  id={`panel-${source}-header`}
                                >
                                  <Typography
                                    variant="subtitle1"
                                    color="primary"
                                  >
                                    {source}
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                  <List dense>
                                    {docs.map((doc, docIndex) => (
                                      <ListItem key={docIndex}>
                                        <ListItemText
                                          primary={doc.title}
                                          secondary={
                                            doc.text ? (() => {
                                              const lines = doc.text.split('\n');
                                              return lines.map((line, index) => (
                                                <React.Fragment key={index}>
                                                  {line}
                                                  {index < lines.length - 1 && <br />}
                                                </React.Fragment>
                                              ));
                                            })() : "Không có nội dung"
                                          }
                                        />
                                      </ListItem>
                                    ))}
                                  </List>
                                </AccordionDetails>
                              </Accordion>
                            )
                          )}
                        </>
                      )}
                  </AccordionDetails>
                </Accordion>
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
