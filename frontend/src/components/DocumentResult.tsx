import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReactMarkdown from 'react-markdown';

interface DocumentItem {
  title: string;
  answer?: string;
  documents?: Record<string, Array<{ title: string; text: string }>>;
  sub_items?: DocumentItem[];
  details?: DocumentItem[];
  sub_details?: DocumentItem[];
}

interface DocumentResultProps {
  item: DocumentItem;
  level?: number;
}

const DocumentResult: React.FC<DocumentResultProps> = ({ item, level = 0 }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ ml: level * 2 }}>
      <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography  sx={{fontWeight: 'bold' }}>
            {item.title}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {item.answer && (
            <Box sx={{ mb: 2 }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  color: 'primary.main', 
                  fontWeight: 'bold', 
                  borderBottom: '2px solid', 
                  borderColor: 'primary.main', 
                  pb: 1, 
                  mb: 2 
                }}
              >
                AI trả lời
              </Typography>
              <Box
                sx={{
                  "& p": { mb: 2 },
                  "& ul": { pl: 2, mb: 2 },
                  "& li": { mb: 1 },
                  "& strong": { fontWeight: "bold" },
                }}
              >
                <ReactMarkdown>{item.answer}</ReactMarkdown>
              </Box>
            </Box>
          )}

          {item.documents && Object.entries(item.documents).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography 
                variant="h6" 
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
              {Object.entries(item.documents).map(([source, docs]) => (
                <Accordion key={source}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {source}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <List>
                      {docs.map((doc, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={
                              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                {doc.title}
                              </Typography>
                            }
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
              ))}
            </Box>
          )}

          {item.sub_items && item.sub_items.map((subItem, index) => (
            <DocumentResult key={index} item={subItem} level={level + 1} />
          ))}

          {item.details && item.details.map((detail, index) => (
            <DocumentResult key={index} item={detail} level={level + 1} />
          ))}

          {item.sub_details && item.sub_details.map((subDetail, index) => (
            <DocumentResult key={index} item={subDetail} level={level + 1} />
          ))}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default DocumentResult; 