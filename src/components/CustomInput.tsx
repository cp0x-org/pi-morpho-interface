import { styled } from '@mui/material/styles';
import { TextField } from '@mui/material';

export const CustomInput = styled(TextField)(() => ({
  '& .MuiInputBase-root': {
    background: 'none',
    border: 'none',
    boxShadow: 'none',
    fontSize: '2.5rem',
    caretColor: 'text.main'
  },
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none'
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    border: 'none'
  },
  '& .MuiInputBase-input': {
    background: 'none',
    MozAppearance: 'textfield',
    caretWidth: '3px', // толще курсор
    '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
      WebkitAppearance: 'none',
      margin: 0
    }
  },
  '& .MuiInputBase-input::placeholder': {
    fontSize: '2.5rem',
    opacity: 0.5
  }
}));
