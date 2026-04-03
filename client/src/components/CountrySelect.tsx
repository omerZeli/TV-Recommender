import { useMemo } from 'react'
import Select, { type StylesConfig } from 'react-select'
import countryList from 'react-select-country-list'

interface CountryOption {
  value: string
  label: string
}

const selectStyles: StylesConfig<CountryOption, false> = {
  control: (base, state) => ({
    ...base,
    padding: '4px 4px',
    border: `1px solid ${state.isFocused ? '#667eea' : '#ddd'}`,
    borderRadius: 4,
    fontSize: 14,
    fontFamily: 'inherit',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(102, 126, 234, 0.1)' : 'none',
    transition: 'all 0.3s ease',
    '&:hover': { borderColor: state.isFocused ? '#667eea' : '#ccc' },
  }),
  option: (base, state) => ({
    ...base,
    fontSize: 14,
    backgroundColor: state.isSelected ? '#667eea' : state.isFocused ? 'rgba(102, 126, 234, 0.1)' : 'white',
    color: state.isSelected ? 'white' : '#333',
    '&:active': { backgroundColor: '#5568d3' },
  }),
  placeholder: (base) => ({ ...base, color: '#999' }),
  input: (base) => ({ ...base, color: '#333', '& input': { boxShadow: 'none !important' } }),
  singleValue: (base) => ({ ...base, color: '#333' }),
  menu: (base) => ({ ...base, borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }),
}

interface CountrySelectProps {
  value: string
  onChange: (value: string) => void
  isDisabled?: boolean
  id?: string
}

export function CountrySelect({ value, onChange, isDisabled, id }: CountrySelectProps) {
  const options = useMemo(() => countryList().getData(), [])
  const selected = options.find((o) => o.label === value) ?? null

  return (
    <Select<CountryOption>
      inputId={id}
      options={options}
      value={selected}
      onChange={(opt) => onChange(opt?.label ?? '')}
      isDisabled={isDisabled}
      placeholder="Select a country"
      isClearable
      styles={selectStyles}
    />
  )
}
