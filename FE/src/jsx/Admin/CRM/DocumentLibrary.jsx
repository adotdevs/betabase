import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CloudUpload,
  Delete,
  Description,
  Download,
  Edit,
  FolderOpen,
  Image as ImageIcon,
  InsertDriveFile,
  PictureAsPdf,
  Refresh,
  Search,
  Visibility,
} from '@mui/icons-material';
import { useAuthUser } from 'react-auth-kit';
import { toast } from 'react-toastify';
import Sidebar from './Sidebar';
import CrmAppBarActions from './components/CrmAppBarActions';
import {
  deleteCrmDocumentApi,
  downloadCrmDocumentApi,
  getCrmDocumentCategoriesApi,
  getCrmDocumentsApi,
  updateCrmDocumentApi,
  uploadCrmDocumentApi,
} from '../../../Api/Service';

const formatFileSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const DocumentLibrary = () => {
  const authUser = useAuthUser();
  const user = authUser()?.user;
  const canManage = user?.role === 'superadmin' || user?.role === 'admin';

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState(['General']);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 24 });
  const [libraryStats, setLibraryStats] = useState({ total: 0, pdfTotal: 0, imageTotal: 0 });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'General',
  });
  const fileInputRef = useRef(null);

  const stats = useMemo(
    () => ({
      total: libraryStats.total,
      pdfCount: libraryStats.pdfTotal,
      imageCount: libraryStats.imageTotal,
    }),
    [libraryStats]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const response = await getCrmDocumentCategoriesApi();
      if (response.success && Array.isArray(response.categories)) {
        setCategories(response.categories);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCrmDocumentsApi({
        page,
        limit: 24,
        search,
        category: categoryFilter,
        fileType: typeFilter,
      });
      if (response.success) {
        setDocuments(response.documents || []);
        setPagination(response.pagination || { total: 0, pages: 1, limit: 24 });
        setLibraryStats(response.stats || { total: 0, pdfTotal: 0, imageTotal: 0 });
      } else {
        toast.error(response.msg || 'Failed to load documents');
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, typeFilter]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const resetUploadForm = () => {
    setForm({ title: '', description: '', category: 'General' });
    setUploadFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF and image files are allowed');
      event.target.value = '';
      return;
    }

    setUploadFile(file);
    if (!form.title.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setForm((prev) => ({ ...prev, title: nameWithoutExt }));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please choose a file to upload');
      return;
    }
    if (!form.title.trim()) {
      toast.error('Document name is required');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', form.title.trim());
    formData.append('description', form.description.trim());
    formData.append('category', form.category.trim() || 'General');

    try {
      setUploading(true);
      const response = await uploadCrmDocumentApi(formData);
      if (response.success) {
        toast.success(response.msg || 'Document uploaded');
        setUploadOpen(false);
        resetUploadForm();
        fetchDocuments();
        fetchCategories();
      } else {
        toast.error(response.msg || 'Upload failed');
      }
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openEditDialog = (doc) => {
    setSelectedDoc(doc);
    setForm({
      title: doc.title || '',
      description: doc.description || '',
      category: doc.category || 'General',
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedDoc?._id) return;
    if (!form.title.trim()) {
      toast.error('Document name is required');
      return;
    }

    try {
      const response = await updateCrmDocumentApi(selectedDoc._id, {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim() || 'General',
      });
      if (response.success) {
        toast.success(response.msg || 'Document updated');
        setEditOpen(false);
        setSelectedDoc(null);
        fetchDocuments();
        fetchCategories();
      } else {
        toast.error(response.msg || 'Update failed');
      }
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}" from the library?`)) return;

    try {
      const response = await deleteCrmDocumentApi(doc._id);
      if (response.success) {
        toast.success(response.msg || 'Document deleted');
        fetchDocuments();
      } else {
        toast.error(response.msg || 'Delete failed');
      }
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const handleDownload = async (doc) => {
    try {
      const response = await downloadCrmDocumentApi(doc._id);
      if (!response?.data || !(response.data instanceof Blob)) {
        toast.error('Download failed');
        return;
      }

      const ext = doc.fileType === 'pdf' ? 'pdf' : 'jpg';
      const safeName = (doc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
    }
  };

  const handleView = (doc) => {
    const url = doc.fileType === 'pdf' ? doc.fileUrl : doc.previewUrl || doc.fileUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        mobileMenuState={isMobileMenu}
        setMobileMenuState={setIsMobileMenu}
      />

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: { xs: 1, sm: 0 } }}>
            <FolderOpen sx={{ color: 'primary.main' }} />
            <Box sx={{ flexGrow: 1, minWidth: 180 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                Document Library
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Shared CRM resources for your team
              </Typography>
            </Box>
            {canManage && (
              <Button
                variant="contained"
                startIcon={<CloudUpload />}
                onClick={() => {
                  resetUploadForm();
                  setUploadOpen(true);
                }}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
              >
                Upload Document
              </Button>
            )}
            <IconButton onClick={fetchDocuments}>
              <Refresh />
            </IconButton>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 2, md: 3 }, flex: 1 }}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Total Documents', value: stats.total, icon: <InsertDriveFile />, color: 'primary.main' },
              { label: 'PDF Files', value: stats.pdfCount, icon: <PictureAsPdf />, color: 'error.main' },
              { label: 'Images', value: stats.imageCount, icon: <ImageIcon />, color: 'success.main' },
            ].map((item) => (
              <Grid item xs={12} sm={4} key={item.label}>
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    border: 1,
                    borderColor: 'divider',
                    background: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
                        : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: `${item.color}22`, color: item.color, width: 48, height: 48 }}>
                      {item.icon}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {item.label}
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        {item.value}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card elevation={0} sx={{ mb: 3, borderRadius: 3, border: 1, borderColor: 'divider' }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={5}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search by name, category, or filename..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={categoryFilter}
                      label="Category"
                      onChange={(e) => {
                        setCategoryFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <MenuItem value="">All Categories</MenuItem>
                      {categories.map((category) => (
                        <MenuItem key={category} value={category}>
                          {category}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={typeFilter}
                      label="Type"
                      onChange={(e) => {
                        setTypeFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <MenuItem value="">All Types</MenuItem>
                      <MenuItem value="pdf">PDF</MenuItem>
                      <MenuItem value="image">Images</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => {
                      setSearchInput('');
                      setSearch('');
                      setCategoryFilter('');
                      setTypeFilter('');
                      setPage(1);
                    }}
                    sx={{ height: 40, borderRadius: 2, textTransform: 'none' }}
                  >
                    Clear Filters
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {loading ? (
            <Box display="flex" justifyContent="center" py={10}>
              <CircularProgress />
            </Box>
          ) : documents.length === 0 ? (
            <Card elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: 'divider' }}>
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <Description sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  No documents found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {canManage
                    ? 'Upload PDFs and images to build your shared CRM document library.'
                    : 'Documents uploaded by admins will appear here.'}
                </Typography>
                {canManage && (
                  <Button
                    variant="contained"
                    startIcon={<CloudUpload />}
                    onClick={() => {
                      resetUploadForm();
                      setUploadOpen(true);
                    }}
                    sx={{ borderRadius: 2, textTransform: 'none' }}
                  >
                    Upload First Document
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Grid container spacing={2.5}>
                {documents.map((doc) => (
                  <Grid item xs={12} sm={6} lg={4} xl={3} key={doc._id}>
                    <Card
                      elevation={0}
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 3,
                        border: 1,
                        borderColor: 'divider',
                        overflow: 'hidden',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: 6,
                        },
                      }}
                    >
                      <Box sx={{ position: 'relative', bgcolor: 'grey.900' }}>
                        {doc.previewUrl ? (
                          <CardMedia
                            component="img"
                            height="180"
                            image={doc.previewUrl}
                            alt={doc.title}
                            sx={{
                              objectFit: 'cover',
                              bgcolor: 'grey.900',
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              height: 180,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: 'grey.900',
                            }}
                          >
                            <PictureAsPdf sx={{ fontSize: 64, color: 'error.light' }} />
                          </Box>
                        )}
                        <Chip
                          size="small"
                          icon={doc.fileType === 'pdf' ? <PictureAsPdf /> : <ImageIcon />}
                          label={doc.fileType === 'pdf' ? 'PDF' : 'Image'}
                          sx={{
                            position: 'absolute',
                            top: 12,
                            left: 12,
                            fontWeight: 700,
                            bgcolor: 'rgba(0,0,0,0.72)',
                            color: 'white',
                          }}
                        />
                        <Chip
                          size="small"
                          label={doc.category || 'General'}
                          sx={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            fontWeight: 600,
                            bgcolor: 'rgba(25, 118, 210, 0.85)',
                            color: 'white',
                          }}
                        />
                      </Box>

                      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 800, mb: 0.5, lineHeight: 1.3 }}
                          noWrap
                          title={doc.title}
                        >
                          {doc.title}
                        </Typography>
                        {doc.description ? (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              mb: 1.5,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              minHeight: 40,
                            }}
                          >
                            {doc.description}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled" sx={{ mb: 1.5, minHeight: 40 }}>
                            No description
                          </Typography>
                        )}

                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            Uploaded by {doc.uploadedByName || 'Admin'} · {formatDate(doc.createdAt)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatFileSize(doc.fileSize)}
                            {doc.originalFileName ? ` · ${doc.originalFileName}` : ''}
                          </Typography>
                        </Stack>
                      </CardContent>

                      <CardActions sx={{ px: 2, pb: 2, pt: 0, gap: 0.5 }}>
                        {doc.fileType === 'image' && (
                          <Tooltip title="View">
                            <IconButton size="small" onClick={() => handleView(doc)}>
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Download">
                          <IconButton size="small" color="primary" onClick={() => handleDownload(doc)}>
                            <Download fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canManage && (
                          <>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openEditDialog(doc)}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" onClick={() => handleDelete(doc)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {pagination.pages > 1 && (
                <Box display="flex" justifyContent="center" mt={4}>
                  <Pagination
                    count={pagination.pages}
                    page={page}
                    onChange={(e, value) => setPage(value)}
                    color="primary"
                    shape="rounded"
                  />
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      <Dialog open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Upload Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: uploadFile ? 'success.main' : 'divider',
                borderRadius: 3,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: uploadFile ? 'success.dark' : 'action.hover',
                transition: 'all 0.2s ease',
              }}
            >
              <CloudUpload sx={{ fontSize: 40, mb: 1, color: uploadFile ? 'success.light' : 'text.secondary' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {uploadFile ? uploadFile.name : 'Choose PDF or image file'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                PDF, JPG, PNG, WEBP, GIF · Max 25MB
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf,image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={handleFileSelect}
              />
            </Box>

            <TextField
              label="Document Name"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={form.category}
                label="Category"
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {categories.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUploadOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleUpload} disabled={uploading} startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <CloudUpload />}>
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Edit Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Document Name"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={form.category}
                label="Category"
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {categories.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdate}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DocumentLibrary;
