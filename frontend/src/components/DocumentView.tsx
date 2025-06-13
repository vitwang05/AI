import React from 'react';
import { Box, Typography } from '@mui/material';
import DocumentResult from './DocumentResult';

interface DocumentViewProps {
  document: any[];
  processingTime?: number;
}

const DocumentView: React.FC<DocumentViewProps> = ({ document, processingTime }) => {
  return (
    <Box>
      {processingTime && (
        <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
          Thời gian xử lý: {processingTime.toFixed(2)} giây
        </Typography>
      )}
      {document && document.map((item, index) => (
        <DocumentResult key={index} item={item} />
      ))}
    </Box>
  );
};

export default DocumentView; 