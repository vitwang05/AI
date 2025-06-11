import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import axios from 'axios';

interface Document {
  question: string;
  answer: string;
  documents?: string[];
}

interface ResultsProps {
  results: {
    processing_time?: number;
    results?: Document[];
  };
  onReset: () => void;
}

const Results: React.FC<ResultsProps> = ({ results, onReset }) => {
  const [downloading, setDownloading] = useState<boolean>(false);

  const handleDownloadDocx = async () => {
    try {
      setDownloading(true);
      const response = await axios.post('http://localhost:8000/generate-docx', {}, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'qa_results.docx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading file:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6">Kết quả xử lý</Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadDocx}
            disabled={downloading}
            sx={{ mr: 2 }}
          >
            {downloading ? 'Đang tải...' : 'Tải file DOCX'}
          </Button>
          <Button variant="outlined" onClick={onReset}>
            Xử lý file mới
          </Button>
        </Box>
      </Box>

      {results.processing_time && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
          <Typography variant="subtitle1" color="text.secondary">
            Thời gian xử lý: {results.processing_time.toFixed(2)} giây
          </Typography>
        </Paper>
      )}

      {results && results.results?.map((qa, index) => (
        <Accordion key={index}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              <strong>Câu hỏi {index + 1}:</strong> {qa.question}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="subtitle1" gutterBottom>
              <strong>Trả lời:</strong>
            </Typography>
            <Typography paragraph>
              {qa.answer}
            </Typography>

            {qa.documents && qa.documents.length > 0 && (
              <>
                <Typography variant="subtitle1" gutterBottom>
                  <strong>Tài liệu tham khảo:</strong>
                </Typography>
                <List dense>
                  {qa.documents.map((doc, docIndex) => (
                    <ListItem key={docIndex}>
                      <ListItemText primary={doc} />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default Results; 