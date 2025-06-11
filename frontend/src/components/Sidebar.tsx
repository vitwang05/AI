import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Box,
  ListItemButton,
  Collapse
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

interface File {
  name: string;
  [key: string]: any;
}

interface SidebarProps {
  uploadedFiles?: File[];
  processedFiles?: File[];
  onFileSelect?: (file: File, type: 'uploaded' | 'processed') => void;
  onNewProcess: () => void;
}

const drawerWidth = 280;

const Sidebar: React.FC<SidebarProps> = ({ uploadedFiles, processedFiles, onFileSelect, onNewProcess }) => {
  const [openUploaded, setOpenUploaded] = React.useState<boolean>(true);
  const [openProcessed, setOpenProcessed] = React.useState<boolean>(true);

  const handleUploadedClick = () => {
    setOpenUploaded(!openUploaded);
  };

  const handleProcessedClick = () => {
    setOpenProcessed(!openProcessed);
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          position: 'relative',
          height: '100vh',
          borderRight: '1px solid rgba(0, 0, 0, 0.12)',
        },
      }}
    >
      <Box sx={{ overflow: 'auto', mt: 8 }}>
        <Typography variant="h6" sx={{ p: 2, fontWeight: 'bold' }}>
          Law QA System
        </Typography>
        <Divider />
        
        <List component="nav">
          {/* Mục xử lý văn bản mới */}
          <ListItemButton onClick={onNewProcess}>
            <ListItemIcon>
              <AddCircleOutlineIcon />
            </ListItemIcon>
            <ListItemText primary="Xử lý văn bản mới" />
          </ListItemButton>

          <Divider sx={{ my: 2 }} />

          {/* Mục văn bản đã upload */}
          <ListItemButton onClick={handleUploadedClick}>
            <ListItemIcon>
              <UploadFileIcon />
            </ListItemIcon>
            <ListItemText primary="Văn bản đã upload" />
            {openUploaded ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
          <Collapse in={openUploaded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {uploadedFiles?.map((file, index) => (
                <ListItemButton 
                  key={`uploaded-${index}`} 
                  sx={{ pl: 4 }}
                  onClick={() => onFileSelect && onFileSelect(file, 'uploaded')}
                >
                  <ListItemIcon>
                    <InsertDriveFileIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary={file.name} 
                    primaryTypographyProps={{
                      noWrap: true,
                      style: { fontSize: '0.9rem' }
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Collapse>

          <Divider sx={{ my: 2 }} />
          
          {/* Mục văn bản đã xử lý */}
          <ListItemButton onClick={handleProcessedClick}>
            <ListItemIcon>
              <DescriptionIcon />
            </ListItemIcon>
            <ListItemText primary="Văn bản đã xử lý" />
            {openProcessed ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
          <Collapse in={openProcessed} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {processedFiles?.map((file, index) => (
                <ListItemButton 
                  key={`processed-${index}`} 
                  sx={{ pl: 4 }}
                  onClick={() => onFileSelect && onFileSelect(file, 'processed')}
                >
                  <ListItemIcon>
                    <InsertDriveFileIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary={file.name}
                    primaryTypographyProps={{
                      noWrap: true,
                      style: { fontSize: '0.9rem' }
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Collapse>
        </List>
      </Box>
    </Drawer>
  );
}

export default Sidebar; 