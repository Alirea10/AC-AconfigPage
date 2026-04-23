import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { CHARACTER_NAME_MAP } from './constants';

interface Props {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SecretarySelector({ value, onChange, disabled }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownRect, setDropdownRect] = useState<{ top: number, left: number, width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const secretaryList = useMemo(() => Object.entries(CHARACTER_NAME_MAP), []);
  
  const filteredList = useMemo(() => {
    if (!search) return secretaryList;
    const lowerSearch = search.toLowerCase();
    return secretaryList.filter(([_, name]) => 
      name.toLowerCase().includes(lowerSearch)
    );
  }, [search, secretaryList]);

  const currentName = useMemo(() => 
    value ? CHARACTER_NAME_MAP[value] || 'UNKNOWN' : '请选择干员',
    [value]
  );

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownRect({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width
          });
        }
      };
      updatePosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // 检查点击是否在容器内
      const isInsideContainer = containerRef.current && containerRef.current.contains(event.target as Node);
      // 检查点击是否在 Portal 出来的下拉框内 (通过 classname 简单判断，或者用 Ref)
      const isInsideDropdown = (event.target as HTMLElement).closest('.selector-dropdown');
      
      if (!isInsideContainer && !isInsideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const dropdown = isOpen && dropdownRect && createPortal(
    <div
      className="selector-dropdown"
      style={{
        position: 'absolute',
        top: `${dropdownRect.top + 5}px`,
        left: `${dropdownRect.left}px`,
        width: `${dropdownRect.width}px`,
      }}
    >
      <input
        type="text"
        className="input-field"
        style={{ width: '100%', marginBottom: '10px', position: 'sticky', top: 0, zIndex: 1 }}
        placeholder="搜索干员名称..."
        value={search}
        onInput={(e) => setSearch(e.currentTarget.value)}
        autoFocus
      />
      <div className="selector-options">
        {filteredList.length > 0 ? (
          filteredList.map(([id, name]) => (
            <div
              key={id}
              className={`selector-option ${value === id ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(id);
                setIsOpen(false);
                setSearch('');
              }}
            >
              {name}
            </div>
          ))
        ) : (
          <div style={{ padding: '10px', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
            未找到相关干员
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <div ref={containerRef} className="selector-container">
      <div 
        className={`select-field ${disabled ? 'disabled' : ''}`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span>{currentName}</span>
        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>{isOpen ? '▲' : '▼'}</span>
      </div>
      {dropdown}
    </div>
  );
}