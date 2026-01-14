import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Papa from 'papaparse';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { 
  Upload, 
  FileText, 
  Activity, 
  Users, 
  AlertCircle, 
  Search,
  TrendingDown,
  TrendingUp,
  Sword,
  Settings,
  Check,
  X,
  Zap,
  Filter,
  Flame,
  Heart,
  Shield,
  Target
} from 'lucide-react';

// --- Types ---

interface LogEntry {
  time: number;
  unit: string;
  hp: number;
  originalRow: any;
}

interface SkillEntry {
  time: number;
  unit: string;
  skill: string;
}

interface EffectDamageEntry {
  time: number;
  unit: string;
  effect: string;
  rawDamage: number;       // 施加伤害
  hpDeduction: number;     // 实际生命扣除
  shieldDeduction: number; // 护盾扣除
}

interface EffectHealingEntry {
  time: number;
  unit: string;
  effect: string;
  healing: number;
}

interface EffectShieldEntry {
  time: number;
  unit: string;
  effect: string;
  shieldValue: number;
}

interface ProcessedData {
  entries: LogEntry[];
  skillEntries: SkillEntry[];
  effectDamageEntries: EffectDamageEntry[];
  effectHealingEntries: EffectHealingEntry[];
  effectShieldEntries: EffectShieldEntry[];
  units: string[];
  timeRange: [number, number];
}

// --- Constants ---
const COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#84cc16', // Lime
];

// --- Components ---

// Custom Hook for ResizeObserver to replace ResponsiveContainer
const useResizeObserver = (ref: React.RefObject<HTMLDivElement>) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [ref]);

  return dimensions;
};

// AutoSizer Component
const AutoSizer = ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(containerRef);

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 min-w-0 overflow-hidden">
      {dimensions && dimensions.width > 0 && dimensions.height > 0 ? (
        children(dimensions)
      ) : null}
    </div>
  );
};


const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Sort descending by value
    const sortedPayload = [...payload].sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

    return (
      <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg shadow-xl text-sm z-50 bg-opacity-95 backdrop-blur-sm min-w-[200px] w-max">
        <p className="text-gray-400 mb-2 border-b border-gray-700 pb-1 text-xs font-mono">{`时间: ${label}`}</p>
        <div className="flex flex-col gap-1.5">
          {sortedPayload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-6">
              <span className="font-medium whitespace-nowrap" style={{ color: entry.color }}>
                {entry.name}
              </span>
              <span className="font-bold font-mono whitespace-nowrap" style={{ color: entry.color }}>
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const FileUpload = ({ onDataLoaded }: { onDataLoaded: (data: ProcessedData, fileName: string) => void }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<string>("GBK");

  const processFile = useCallback((file: File) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false, 
      encoding: encoding, 
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn("CSV Warnings:", results.errors);
        }
        
        const rawRows = results.data as string[][];
        if (!rawRows || rawRows.length === 0) {
          setError("文件似乎为空。");
          return;
        }

        const entries: LogEntry[] = [];
        const skillEntries: SkillEntry[] = [];
        const effectDamageEntries: EffectDamageEntry[] = [];
        const effectHealingEntries: EffectHealingEntry[] = [];
        const effectShieldEntries: EffectShieldEntry[] = [];
        const unitsSet = new Set<string>();
        let minTime = Infinity;
        let maxTime = -Infinity;

        // --- Format Detection ---
        const firstRowStr = rawRows[0].map(String);
        const hasStandardHeaders = 
          firstRowStr.some(c => /time|date|timestamp/i.test(c)) && 
          firstRowStr.some(c => /unit|name|source|player/i.test(c)) &&
          firstRowStr.some(c => /hp|health|life/i.test(c));

        if (hasStandardHeaders) {
          // --- STANDARD CSV MODE ---
          const timeIdx = firstRowStr.findIndex(k => /time|date|timestamp|tick|seconds/i.test(k));
          const unitIdx = firstRowStr.findIndex(k => /unit|name|source|player|actor|target/i.test(k));
          const hpIdx = firstRowStr.findIndex(k => /hp|health|life|current_hp|curhp/i.test(k));

          if (timeIdx === -1 || unitIdx === -1 || hpIdx === -1) {
            setError("无法匹配标准列头 (Time, Unit, HP)。");
            return;
          }

          for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            const time = Number(row[timeIdx]);
            const unit = String(row[unitIdx]).trim();
            const hp = Number(row[hpIdx]);

            if (!isNaN(time) && !isNaN(hp) && unit) {
              entries.push({ time, unit, hp, originalRow: row });
              unitsSet.add(unit);
              if (time < minTime) minTime = time;
              if (time > maxTime) maxTime = time;
            }
          }

        } else {
          // --- CUSTOM / COMPLEX MODE ---
          const unitMap = new Map<string, string>(); // uid -> Name

          // Regex definitions
          const hpGenericRegex = /(?:^|[\s,;{("])(?:HP|hp|Health|current_hp|curhp|生命)\s*=\s*(\d+)/i;
          const hpChangeRegex = /变动情况.*=>\s*(\d+)/;
          const uidRegex = /uid\s*=\s*(\d+)/i;
          
          // Damage regexes
          const rawDamageRegex = /施加伤害=(\d+)/i;
          const hpDeductionRegex = /实际生命扣除=(\d+)/i;
          const shieldDeductionRegex = /护盾扣除=(\d+)/i;

          const healingRegex = /回复生命值=(\d+)/i;
          const shieldAddedRegex = /添加护盾值=(\d+)/i;

          rawRows.forEach((row, idx) => {
            const values = row.map(String);
            
            // 1. Extract Time
            let time = parseFloat(values[0]);
            if (isNaN(time)) {
               time = idx;
            }

            // 2. Extract Event Type
            const eventType = values.length > 2 ? values[2].trim() : "";

            // --- SKILL PARSING ---
            const isSkillEvent = eventType.includes('技能释放');
            if (isSkillEvent && values.length > 4) {
               // Format: Time, SysTime, 技能释放, UnitName, SkillName
               const u = values[3].trim();
               const s = values[4].trim();
               if (u && s) {
                 skillEntries.push({ time, unit: u, skill: s });
                 unitsSet.add(u);
                 if (time < minTime) minTime = time;
                 if (time > maxTime) maxTime = time;
               }
            }

            // --- EFFECT DAMAGE & HEALING & SHIELD PARSING ---
            const isEffectEvent = eventType.includes('效果触发');
            if (isEffectEvent && values.length > 6) {
               const u = values[3].trim(); // Source Unit
               
               // Damage Logic
               if (values.length > 7 && values[4]?.trim() === '伤害目标') {
                 const effectName = values[6].trim();
                 
                 // Scan row for damage fields
                 let rawDamage = 0;
                 let hpDeduction = 0;
                 let shieldDeduction = 0;
                 let foundDamage = false;

                 for (const val of values) {
                    const rMatch = val.match(rawDamageRegex);
                    if (rMatch) {
                      rawDamage = parseInt(rMatch[1], 10);
                      foundDamage = true;
                    }
                    const hMatch = val.match(hpDeductionRegex);
                    if (hMatch) {
                      hpDeduction = parseInt(hMatch[1], 10);
                    }
                    const sMatch = val.match(shieldDeductionRegex);
                    if (sMatch) {
                      shieldDeduction = parseInt(sMatch[1], 10);
                    }
                 }

                 // Backward compatibility: If no "施加伤害", look for old "伤害="
                 if (!foundDamage) {
                    const oldDamageRegex = /伤害=(\d+)/i;
                    for (const val of values) {
                        const match = val.match(oldDamageRegex);
                        if (match) {
                            rawDamage = parseInt(match[1], 10);
                            foundDamage = true;
                        }
                    }
                 }

                 if (u && effectName && foundDamage) {
                    effectDamageEntries.push({
                      time,
                      unit: u,
                      effect: effectName,
                      rawDamage,
                      hpDeduction,
                      shieldDeduction
                    });
                    unitsSet.add(u);
                    if (time < minTime) minTime = time;
                    if (time > maxTime) maxTime = time;
                 }
               }
               
               // Healing Logic
               let healing = 0;
               let foundHealing = false;
               
               for (const val of values) {
                 const match = val.match(healingRegex);
                 if (match) {
                   healing = parseInt(match[1], 10);
                   foundHealing = true;
                   break;
                 }
               }

               if (foundHealing) {
                  const effectName = values[6]?.trim();
                  
                  if (u && effectName) {
                     effectHealingEntries.push({
                       time,
                       unit: u,
                       effect: effectName,
                       healing: healing
                     });
                     unitsSet.add(u);
                     if (time < minTime) minTime = time;
                     if (time > maxTime) maxTime = time;
                  }
               }

               // Shield Application Logic
               let shieldValue = 0;
               let foundShield = false;
               
               for (const val of values) {
                 const match = val.match(shieldAddedRegex);
                 if (match) {
                   shieldValue = parseInt(match[1], 10);
                   foundShield = true;
                   break;
                 }
               }

               if (foundShield) {
                  const effectName = values[6]?.trim();
                  
                  if (u && effectName) {
                     effectShieldEntries.push({
                       time,
                       unit: u,
                       effect: effectName,
                       shieldValue: shieldValue
                     });
                     unitsSet.add(u);
                     if (time < minTime) minTime = time;
                     if (time > maxTime) maxTime = time;
                  }
               }
            }

            // --- HP PARSING ---
            let hp = -1;
            let foundHp = false;
            
            const isHpChangeEvent = eventType.includes('血量变化');
            const isUnitCreateEvent = eventType.includes('单位创建');

            if (isHpChangeEvent) {
              for (const val of values) {
                const match = val.match(hpChangeRegex);
                if (match) {
                  hp = parseInt(match[1], 10);
                  foundHp = true;
                  break;
                }
              }
              if (!foundHp) {
                 for (const val of values) {
                  const match = val.match(hpGenericRegex);
                  if (match) {
                    hp = parseInt(match[1], 10);
                    foundHp = true;
                    break;
                  }
                }
              }
            } else if (isUnitCreateEvent) {
              for (const val of values) {
                const match = val.match(hpGenericRegex);
                if (match) {
                  hp = parseInt(match[1], 10);
                  foundHp = true;
                  break;
                }
              }
            }

            let unit = "";
            let uid = "";

            if (isHpChangeEvent || isUnitCreateEvent) {
               if (values.length > 3) {
                 const potentialName = values[3].trim();
                 if (potentialName && !potentialName.includes('=') && !potentialName.includes('{')) {
                   unit = potentialName;
                 }
               }
            }

            for (const val of values) {
              const m = val.match(uidRegex);
              if (m) {
                uid = m[1];
                break;
              }
            }

            if (uid && unit) {
              unitMap.set(uid, unit);
            }

            if (!unit && uid && unitMap.has(uid)) {
              unit = unitMap.get(uid)!;
            }
            
            if (!unit && unitsSet.size > 0) {
              if (foundHp) {
                for (const knownUnit of Array.from(unitsSet)) {
                  if (values.some(v => v.includes(knownUnit))) {
                     unit = knownUnit;
                     break;
                  }
                }
              }
            }

            if (foundHp && hp !== -1 && unit) {
              entries.push({ time, unit, hp, originalRow: row });
              unitsSet.add(unit);
              if (time < minTime) minTime = time;
              if (time > maxTime) maxTime = time;
            }
          });
        }

        if (entries.length === 0 && skillEntries.length === 0 && effectDamageEntries.length === 0 && effectHealingEntries.length === 0 && effectShieldEntries.length === 0) {
          setError(`解析了 ${rawRows.length} 行，但未找到有效的战报数据。
            支持格式：逻辑时间, 系统时间, 效果类型(如'血量变化', '技能释放', '效果触发')...
            如果是中文日志，请尝试切换右上角的“编码”选项 (如 GBK)。`);
          return;
        }

        onDataLoaded({
          entries,
          skillEntries,
          effectDamageEntries,
          effectHealingEntries,
          effectShieldEntries,
          units: Array.from(unitsSet).sort(),
          timeRange: [minTime, maxTime]
        }, file.name);
        setError(null);
      }
    });
  }, [onDataLoaded, encoding]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 p-1.5 rounded-lg border border-gray-700">
          <Settings className="w-3 h-3" />
          <span>编码:</span>
          <select 
            value={encoding} 
            onChange={(e) => setEncoding(e.target.value)}
            className="bg-transparent text-gray-200 outline-none cursor-pointer w-16"
          >
            <option value="GBK">GBK</option>
            <option value="UTF-8">UTF8</option>
            <option value="Big5">Big5</option>
          </select>
        </div>
      </div>

      <div 
        className={`border-2 border-dashed rounded-xl p-4 transition-all duration-300 text-center cursor-pointer
          ${isDragging 
            ? 'border-accent-500 bg-accent-500/10 scale-[1.01]' 
            : 'border-gray-700 hover:border-gray-500 bg-gray-800/50'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <input 
          id="file-upload" 
          type="file" 
          accept=".csv,.txt,.log" 
          className="hidden" 
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />
        <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-accent-400' : 'text-gray-400'}`} />
        <h3 className="text-base font-semibold text-gray-200">上传战报</h3>
        <p className="text-xs text-gray-500 mt-2">点击或拖拽文件</p>
      </div>
      
      {error && (
        <div className="bg-red-900/20 border border-red-900/50 text-red-200 p-4 rounded-lg flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">解析错误</p>
            <p className="opacity-90 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const GenericSelector = ({ 
  items, 
  selectedItems, 
  onChange,
  title,
  emptyMessage,
  icon: Icon
}: { 
  items: string[], 
  selectedItems: string[], 
  onChange: (items: string[]) => void,
  title: string,
  emptyMessage: string,
  icon: React.ElementType
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [items, searchTerm]);

  const toggleItem = (item: string) => {
    if (selectedItems.includes(item)) {
      onChange(selectedItems.filter(s => s !== item));
    } else {
      onChange([...selectedItems, item]);
    }
  };

  const selectAll = () => {
     const allVisibleSelected = filteredItems.every(s => selectedItems.includes(s));
     if (allVisibleSelected) {
       const newSelection = selectedItems.filter(s => !filteredItems.includes(s));
       onChange(newSelection);
     } else {
       const newSelection = Array.from(new Set([...selectedItems, ...filteredItems]));
       onChange(newSelection);
     }
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Icon className="w-4 h-4 text-accent-400" />
        <h2 className="font-semibold text-gray-200">{title}</h2>
        <span className="text-xs text-gray-500 ml-auto">{selectedItems.length} 已选</span>
      </div>
      
      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <input 
          type="text"
          placeholder={`搜索${title}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded-lg py-2 pl-9 pr-9 appearance-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 outline-none transition-all text-sm"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex justify-between items-center mb-2 px-1 shrink-0">
        <button onClick={selectAll} className="text-xs text-accent-400 hover:text-accent-300">
           {filteredItems.every(s => selectedItems.includes(s)) && filteredItems.length > 0 ? "取消全选" : "全选当前"}
        </button>
        {selectedItems.length > 0 && (
          <button onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-300">
            清空已选
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
        {filteredItems.length === 0 ? (
          <div className="text-center text-gray-500 py-8 text-sm">
            {emptyMessage}
          </div>
        ) : (
          filteredItems.map(item => {
            const isSelected = selectedItems.includes(item);
            return (
              <div 
                key={item}
                onClick={() => toggleItem(item)}
                className={`flex items-start gap-3 p-2 rounded cursor-pointer transition-colors border
                  ${isSelected 
                    ? 'bg-gray-700/60 border-gray-600' 
                    : 'bg-transparent border-transparent hover:bg-gray-700/30'}`}
              >
                <div 
                  className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors shrink-0
                    ${isSelected ? 'bg-accent-500 border-accent-500' : 'border-gray-500'}`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span 
                  className={`text-sm break-all leading-snug ${isSelected ? 'text-white font-medium' : 'text-gray-400'}`}
                  title={item}
                >
                  {item}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const SkillChart = ({ data, selectedUnits, selectedSkills }: { data: SkillEntry[], selectedUnits: string[], selectedSkills: string[] }) => {
  const chartData = useMemo(() => {
    if (!selectedUnits.length || !data.length) return { data: [], keys: [] };

    const relevantEntries = data.filter(e => 
      selectedUnits.includes(e.unit) && 
      selectedSkills.includes(e.skill)
    );
    
    if (relevantEntries.length === 0) return { data: [], keys: [] };

    const keys = new Set<string>();
    relevantEntries.forEach(e => keys.add(`${e.unit} - ${e.skill}`));
    const sortedKeys = Array.from(keys).sort();

    const entriesByTime = new Map<number, SkillEntry[]>();
    const timestamps = new Set<number>();
    
    relevantEntries.forEach(e => {
      timestamps.add(e.time);
      if (!entriesByTime.has(e.time)) entriesByTime.set(e.time, []);
      entriesByTime.get(e.time)!.push(e);
    });

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);
    const result = [];
    const counters: Record<string, number> = {};

    sortedKeys.forEach(k => counters[k] = 0);

    for (const t of sortedTimestamps) {
      const events = entriesByTime.get(t) || [];
      events.forEach(e => {
        const key = `${e.unit} - ${e.skill}`;
        counters[key] = (counters[key] || 0) + 1;
      });

      const point: any = { time: t };
      let hasData = false;
      sortedKeys.forEach(k => {
        if (counters[k] > 0) {
           point[k] = counters[k];
           hasData = true;
        }
      });
      
      if (hasData) result.push(point);
    }

    return { data: result, keys: sortedKeys };
  }, [data, selectedUnits, selectedSkills]);

  if (selectedUnits.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Users className="w-16 h-16 opacity-20" />
        <p>请选择单位以查看技能统计</p>
      </div>
    );
  }

  if (selectedSkills.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Filter className="w-16 h-16 opacity-20" />
        <p>请选择需要关注的技能</p>
      </div>
    );
  }

  if (!chartData || chartData.data.length === 0) {
    return (
       <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Zap className="w-16 h-16 opacity-20" />
        <p>所选单位在此期间没有释放所选技能</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
       <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700 flex-1 min-h-0">
        <AutoSizer children={({ width, height }) => (
            <LineChart width={width} height={height} data={chartData.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                label={{ value: '时间轴 (Time)', position: 'insideBottomRight', offset: -10, fill: '#6b7280' }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={['auto', 'auto']}
                allowDecimals={false}
                label={{ value: '累计释放次数', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              
              {chartData.keys.map((key, index) => (
                <Line 
                  key={key}
                  type="stepAfter" 
                  dataKey={key} 
                  name={key}
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  animationDuration={1000}
                />
              ))}
            </LineChart>
        )} />
      </div>
    </div>
  );
};

const EffectDamageChart = ({ 
  data, 
  selectedUnits, 
  selectedEffects,
  showRaw,
  showHp,
  showShield
}: { 
  data: EffectDamageEntry[], 
  selectedUnits: string[], 
  selectedEffects: string[],
  showRaw: boolean,
  showHp: boolean,
  showShield: boolean
}) => {
  const chartData = useMemo(() => {
    if (!selectedUnits.length || !data.length) return { data: [], keys: [] };

    const relevantEntries = data.filter(e => 
      selectedUnits.includes(e.unit) && 
      selectedEffects.includes(e.effect)
    );
    
    if (relevantEntries.length === 0) return { data: [], keys: [] };

    const keys = new Set<string>();
    relevantEntries.forEach(e => keys.add(`${e.unit} - ${e.effect}`));
    const sortedKeys = Array.from(keys).sort();

    const entriesByTime = new Map<number, EffectDamageEntry[]>();
    const timestamps = new Set<number>();
    
    relevantEntries.forEach(e => {
      timestamps.add(e.time);
      if (!entriesByTime.has(e.time)) entriesByTime.set(e.time, []);
      entriesByTime.get(e.time)!.push(e);
    });

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);
    const result = [];
    const cumulativeDamage: Record<string, number> = {};

    sortedKeys.forEach(k => cumulativeDamage[k] = 0);

    for (const t of sortedTimestamps) {
      const events = entriesByTime.get(t) || [];
      events.forEach(e => {
        const key = `${e.unit} - ${e.effect}`;
        let val = 0;
        if (showRaw) val += e.rawDamage || 0;
        if (showHp) val += e.hpDeduction || 0;
        if (showShield) val += e.shieldDeduction || 0;
        
        cumulativeDamage[key] = (cumulativeDamage[key] || 0) + val;
      });

      const point: any = { time: t };
      let hasData = false;
      sortedKeys.forEach(k => {
        if (cumulativeDamage[k] > 0) {
           point[k] = cumulativeDamage[k];
           hasData = true;
        }
      });
      
      if (hasData) result.push(point);
    }

    return { data: result, keys: sortedKeys };
  }, [data, selectedUnits, selectedEffects, showRaw, showHp, showShield]);

  if (selectedUnits.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Users className="w-16 h-16 opacity-20" />
        <p>请选择单位以查看效果伤害</p>
      </div>
    );
  }

  if (selectedEffects.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Filter className="w-16 h-16 opacity-20" />
        <p>请选择需要关注的效果</p>
      </div>
    );
  }

  if (!chartData || chartData.data.length === 0) {
    return (
       <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Flame className="w-16 h-16 opacity-20" />
        <p>所选单位在此期间没有触发所选效果的伤害</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
       <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700 flex-1 min-h-0">
        <AutoSizer children={({ width, height }) => (
            <LineChart width={width} height={height} data={chartData.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                label={{ value: '时间轴 (Time)', position: 'insideBottomRight', offset: -10, fill: '#6b7280' }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={['auto', 'auto']}
                label={{ value: '累计数值', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              
              {chartData.keys.map((key, index) => (
                <Line 
                  key={key}
                  type="stepAfter" 
                  dataKey={key} 
                  name={key}
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  animationDuration={1000}
                />
              ))}
            </LineChart>
        )} />
      </div>
    </div>
  );
};

const EffectHealingChart = ({ data, selectedUnits, selectedEffects }: { data: EffectHealingEntry[], selectedUnits: string[], selectedEffects: string[] }) => {
  const chartData = useMemo(() => {
    if (!selectedUnits.length || !data.length) return { data: [], keys: [] };

    const relevantEntries = data.filter(e => 
      selectedUnits.includes(e.unit) && 
      selectedEffects.includes(e.effect)
    );
    
    if (relevantEntries.length === 0) return { data: [], keys: [] };

    const keys = new Set<string>();
    relevantEntries.forEach(e => keys.add(`${e.unit} - ${e.effect}`));
    const sortedKeys = Array.from(keys).sort();

    const entriesByTime = new Map<number, EffectHealingEntry[]>();
    const timestamps = new Set<number>();
    
    relevantEntries.forEach(e => {
      timestamps.add(e.time);
      if (!entriesByTime.has(e.time)) entriesByTime.set(e.time, []);
      entriesByTime.get(e.time)!.push(e);
    });

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);
    const result = [];
    const cumulativeHealing: Record<string, number> = {};

    sortedKeys.forEach(k => cumulativeHealing[k] = 0);

    for (const t of sortedTimestamps) {
      const events = entriesByTime.get(t) || [];
      events.forEach(e => {
        const key = `${e.unit} - ${e.effect}`;
        cumulativeHealing[key] = (cumulativeHealing[key] || 0) + e.healing;
      });

      const point: any = { time: t };
      let hasData = false;
      sortedKeys.forEach(k => {
        if (cumulativeHealing[k] > 0) {
           point[k] = cumulativeHealing[k];
           hasData = true;
        }
      });
      
      if (hasData) result.push(point);
    }

    return { data: result, keys: sortedKeys };
  }, [data, selectedUnits, selectedEffects]);

  if (selectedUnits.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Users className="w-16 h-16 opacity-20" />
        <p>请选择单位以查看效果治疗</p>
      </div>
    );
  }

  if (selectedEffects.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Filter className="w-16 h-16 opacity-20" />
        <p>请选择需要关注的治疗效果</p>
      </div>
    );
  }

  if (!chartData || chartData.data.length === 0) {
    return (
       <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Heart className="w-16 h-16 opacity-20" />
        <p>所选单位在此期间没有触发所选效果的治疗</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
       <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700 flex-1 min-h-0">
        <AutoSizer children={({ width, height }) => (
            <LineChart width={width} height={height} data={chartData.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                label={{ value: '时间轴 (Time)', position: 'insideBottomRight', offset: -10, fill: '#6b7280' }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={['auto', 'auto']}
                label={{ value: '累计治疗量', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              
              {chartData.keys.map((key, index) => (
                <Line 
                  key={key}
                  type="stepAfter" 
                  dataKey={key} 
                  name={key}
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  animationDuration={1000}
                />
              ))}
            </LineChart>
        )} />
      </div>
    </div>
  );
};

const EffectShieldChart = ({ data, selectedUnits, selectedEffects }: { data: EffectShieldEntry[], selectedUnits: string[], selectedEffects: string[] }) => {
  const chartData = useMemo(() => {
    if (!selectedUnits.length || !data.length) return { data: [], keys: [] };

    const relevantEntries = data.filter(e => 
      selectedUnits.includes(e.unit) && 
      selectedEffects.includes(e.effect)
    );
    
    if (relevantEntries.length === 0) return { data: [], keys: [] };

    const keys = new Set<string>();
    relevantEntries.forEach(e => keys.add(`${e.unit} - ${e.effect}`));
    const sortedKeys = Array.from(keys).sort();

    const entriesByTime = new Map<number, EffectShieldEntry[]>();
    const timestamps = new Set<number>();
    
    relevantEntries.forEach(e => {
      timestamps.add(e.time);
      if (!entriesByTime.has(e.time)) entriesByTime.set(e.time, []);
      entriesByTime.get(e.time)!.push(e);
    });

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);
    const result = [];
    const cumulativeShield: Record<string, number> = {};

    sortedKeys.forEach(k => cumulativeShield[k] = 0);

    for (const t of sortedTimestamps) {
      const events = entriesByTime.get(t) || [];
      events.forEach(e => {
        const key = `${e.unit} - ${e.effect}`;
        cumulativeShield[key] = (cumulativeShield[key] || 0) + e.shieldValue;
      });

      const point: any = { time: t };
      let hasData = false;
      sortedKeys.forEach(k => {
        if (cumulativeShield[k] > 0) {
           point[k] = cumulativeShield[k];
           hasData = true;
        }
      });
      
      if (hasData) result.push(point);
    }

    return { data: result, keys: sortedKeys };
  }, [data, selectedUnits, selectedEffects]);

  if (selectedUnits.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Users className="w-16 h-16 opacity-20" />
        <p>请选择单位以查看护盾施加累计</p>
      </div>
    );
  }

  if (selectedEffects.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Filter className="w-16 h-16 opacity-20" />
        <p>请选择需要关注的护盾效果</p>
      </div>
    );
  }

  if (!chartData || chartData.data.length === 0) {
    return (
       <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Shield className="w-16 h-16 opacity-20" />
        <p>所选单位在此期间没有施加所选效果的护盾</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
       <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700 flex-1 min-h-0">
        <AutoSizer children={({ width, height }) => (
            <LineChart width={width} height={height} data={chartData.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                label={{ value: '时间轴 (Time)', position: 'insideBottomRight', offset: -10, fill: '#6b7280' }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={['auto', 'auto']}
                label={{ value: '累计护盾值', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              
              {chartData.keys.map((key, index) => (
                <Line 
                  key={key}
                  type="stepAfter" 
                  dataKey={key} 
                  name={key}
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  animationDuration={1000}
                />
              ))}
            </LineChart>
        )} />
      </div>
    </div>
  );
};

const HpChart = ({ data, selectedUnits }: { data: LogEntry[], selectedUnits: string[] }) => {
  const chartData = useMemo(() => {
    if (!selectedUnits.length || !data.length) return [];

    const relevantEntries = data.filter(e => selectedUnits.includes(e.unit));
    const timestamps = Array.from(new Set(relevantEntries.map(e => e.time))).sort((a, b) => a - b);
    
    const result = [];
    const currentHp: Record<string, number | null> = {};
    
    const entriesByTime = new Map<number, LogEntry[]>();
    for (const e of relevantEntries) {
      if (!entriesByTime.has(e.time)) entriesByTime.set(e.time, []);
      entriesByTime.get(e.time)!.push(e);
    }
    
    for (const t of timestamps) {
      const events = entriesByTime.get(t) || [];
      for (const e of events) {
        currentHp[e.unit] = e.hp;
      }
      
      const point: any = { time: t };
      let hasData = false;
      selectedUnits.forEach(u => {
        if (currentHp[u] !== undefined && currentHp[u] !== null) {
          point[u] = currentHp[u];
          hasData = true;
        }
      });
      
      if (hasData) {
        result.push(point);
      }
    }
    return result;
  }, [data, selectedUnits]);

  const singleUnitStats = useMemo(() => {
    if (selectedUnits.length !== 1) return null;
    const unit = selectedUnits[0];
    const unitEntries = data.filter(e => e.unit === unit).sort((a, b) => a.time - b.time);
    if (!unitEntries.length) return null;
    
    const minHp = Math.min(...unitEntries.map(d => d.hp));
    const maxHp = Math.max(...unitEntries.map(d => d.hp));
    const currentHp = unitEntries[unitEntries.length - 1].hp;
    const startHp = unitEntries[0].hp;
    const trend = currentHp - startHp;
    
    return { minHp, maxHp, currentHp, trend };
  }, [data, selectedUnits]);

  if (selectedUnits.length === 0 || chartData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 min-h-[400px]">
        <Activity className="w-16 h-16 opacity-20" />
        <p>请选择至少一个单位以查看血量曲线</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {singleUnitStats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in shrink-0">
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">当前血量</div>
            <div className="text-2xl font-bold text-white">{singleUnitStats.currentHp.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">最大血量</div>
            <div className="text-2xl font-bold text-emerald-400">{singleUnitStats.maxHp.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">最低血量</div>
            <div className="text-2xl font-bold text-red-400">{singleUnitStats.minHp.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">变化趋势</div>
            <div className={`text-2xl font-bold flex items-center gap-2 ${singleUnitStats.trend >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
              {singleUnitStats.trend >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {Math.abs(singleUnitStats.trend).toLocaleString()}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in shrink-0">
             {selectedUnits.map((u, idx) => {
               const lastPoint = chartData[chartData.length - 1];
               const hp = lastPoint ? lastPoint[u] : 0;
               const color = COLORS[idx % COLORS.length];
               return (
                 <div key={u} className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                       <div className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor: color}}></div>
                       <span className="text-sm text-gray-300 truncate font-medium">{u}</span>
                    </div>
                    <span className="text-lg font-bold text-white pl-2">{typeof hp === 'number' ? hp.toLocaleString() : '-'}</span>
                 </div>
               );
             })}
        </div>
      )}

      <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700 flex-1 min-h-0">
        <AutoSizer children={({ width, height }) => (
            <LineChart width={width} height={height} data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                label={{ value: '时间轴 (Time)', position: 'insideBottomRight', offset: -10, fill: '#6b7280' }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              
              {selectedUnits.map((unit, index) => (
                <Line 
                  key={unit}
                  type="monotone" 
                  dataKey={unit} 
                  name={unit}
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  connectNulls 
                  animationDuration={1000}
                />
              ))}
            </LineChart>
        )} />
      </div>
    </div>
  );
};

const UnitSelector = ({ 
  units, 
  selectedUnits, 
  onChange 
}: { 
  units: string[], 
  selectedUnits: string[], 
  onChange: (units: string[]) => void 
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredUnits = useMemo(() => {
    return units.filter(u => u.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [units, searchTerm]);

  const toggleUnit = (unit: string) => {
    if (selectedUnits.includes(unit)) {
      onChange(selectedUnits.filter(u => u !== unit));
    } else {
      onChange([...selectedUnits, unit]);
    }
  };

  const selectAll = () => {
     const allVisibleSelected = filteredUnits.every(u => selectedUnits.includes(u));
     if (allVisibleSelected) {
       const newSelection = selectedUnits.filter(u => !filteredUnits.includes(u));
       onChange(newSelection);
     } else {
       const newSelection = Array.from(new Set([...selectedUnits, ...filteredUnits]));
       onChange(newSelection);
     }
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Users className="w-4 h-4 text-accent-400" />
        <h2 className="font-semibold text-gray-200">选择单位</h2>
        <span className="text-xs text-gray-500 ml-auto">{selectedUnits.length} 已选</span>
      </div>
      
      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <input 
          type="text"
          placeholder="搜索单位..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded-lg py-2 pl-9 pr-9 appearance-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 outline-none transition-all text-sm"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex justify-between items-center mb-2 px-1 shrink-0">
        <button onClick={selectAll} className="text-xs text-accent-400 hover:text-accent-300">
           {filteredUnits.every(u => selectedUnits.includes(u)) && filteredUnits.length > 0 ? "取消全选" : "全选当前"}
        </button>
        {selectedUnits.length > 0 && (
          <button onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-300">
            清空已选
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
        {filteredUnits.length === 0 ? (
          <div className="text-center text-gray-500 py-8 text-sm">
            未找到匹配单位
          </div>
        ) : (
          filteredUnits.map(unit => {
            const isSelected = selectedUnits.includes(unit);
            const colorIndex = selectedUnits.indexOf(unit);
            const color = isSelected && colorIndex !== -1 ? COLORS[colorIndex % COLORS.length] : undefined;

            return (
              <div 
                key={unit}
                onClick={() => toggleUnit(unit)}
                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors border
                  ${isSelected 
                    ? 'bg-gray-700/60 border-gray-600' 
                    : 'bg-transparent border-transparent hover:bg-gray-700/30'}`}
              >
                <div 
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                    ${isSelected ? 'border-transparent' : 'border-gray-500'}`}
                  style={{ backgroundColor: isSelected ? color : 'transparent' }}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className={`text-sm ${isSelected ? 'text-white font-medium' : 'text-gray-400'}`}>
                  {unit}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedEffects, setSelectedEffects] = useState<string[]>([]);
  const [selectedHealingEffects, setSelectedHealingEffects] = useState<string[]>([]);
  const [selectedShieldEffects, setSelectedShieldEffects] = useState<string[]>([]);
  const [chartMode, setChartMode] = useState<'hp' | 'skill' | 'effect' | 'healing' | 'shield'>('hp');
  
  // Damage Statistics Modes
  const [dmgModeRaw, setDmgModeRaw] = useState(true);
  const [dmgModeHp, setDmgModeHp] = useState(false);
  const [dmgModeShield, setDmgModeShield] = useState(false);

  const handleDataLoaded = (processed: ProcessedData, name: string) => {
    setData(processed);
    setFileName(name);
    if (processed.units.length > 0) {
      setSelectedUnits(processed.units.slice(0, 3));
    } else {
      setSelectedUnits([]);
    }
    setSelectedSkills([]);
    setSelectedEffects([]);
    setSelectedHealingEffects([]);
    setSelectedShieldEffects([]);
  };

  const availableSkills = useMemo(() => {
    if (!data || selectedUnits.length === 0) return [];
    const skills = new Set<string>();
    data.skillEntries.forEach(e => {
      if (selectedUnits.includes(e.unit)) {
        skills.add(e.skill);
      }
    });
    return Array.from(skills).sort();
  }, [data, selectedUnits]);

  const availableEffects = useMemo(() => {
    if (!data || selectedUnits.length === 0) return [];
    const effects = new Set<string>();
    data.effectDamageEntries.forEach(e => {
      if (selectedUnits.includes(e.unit)) {
        effects.add(e.effect);
      }
    });
    return Array.from(effects).sort();
  }, [data, selectedUnits]);

  const availableHealingEffects = useMemo(() => {
    if (!data || selectedUnits.length === 0) return [];
    const effects = new Set<string>();
    data.effectHealingEntries.forEach(e => {
      if (selectedUnits.includes(e.unit)) {
        effects.add(e.effect);
      }
    });
    return Array.from(effects).sort();
  }, [data, selectedUnits]);

  const availableShieldEffects = useMemo(() => {
    if (!data || selectedUnits.length === 0) return [];
    const effects = new Set<string>();
    data.effectShieldEntries.forEach(e => {
      if (selectedUnits.includes(e.unit)) {
        effects.add(e.effect);
      }
    });
    return Array.from(effects).sort();
  }, [data, selectedUnits]);

  useEffect(() => {
    if (chartMode === 'skill' && availableSkills.length > 0 && selectedSkills.length === 0) {
       setSelectedSkills(availableSkills);
    }
    if (chartMode === 'effect' && availableEffects.length > 0 && selectedEffects.length === 0) {
       setSelectedEffects(availableEffects);
    }
    if (chartMode === 'healing' && availableHealingEffects.length > 0 && selectedHealingEffects.length === 0) {
       setSelectedHealingEffects(availableHealingEffects);
    }
    if (chartMode === 'shield' && availableShieldEffects.length > 0 && selectedShieldEffects.length === 0) {
       setSelectedShieldEffects(availableShieldEffects);
    }
  }, [chartMode, availableSkills.length, availableEffects.length, availableHealingEffects.length, availableShieldEffects.length]);

  const getChartIcon = (mode: string) => {
     if (mode === 'hp') return <Activity className="w-6 h-6 text-accent-400" />;
     if (mode === 'skill') return <Zap className="w-6 h-6 text-yellow-400" />;
     if (mode === 'effect') return <Flame className="w-6 h-6 text-orange-500" />;
     if (mode === 'healing') return <Heart className="w-6 h-6 text-emerald-500" />;
     return <Shield className="w-6 h-6 text-indigo-400" />;
  };

  const getChartTitle = (mode: string) => {
     if (mode === 'hp') return '血量对比分析';
     if (mode === 'skill') return '技能释放统计';
     if (mode === 'effect') return '效果累计伤害';
     if (mode === 'healing') return '效果治疗统计';
     return '护盾施加累计';
  };

  const handleRawChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDmgModeRaw(checked);
    if (checked) {
        setDmgModeHp(false);
        setDmgModeShield(false);
    } else if (!dmgModeHp && !dmgModeShield) {
        setDmgModeRaw(true);
    }
  };

  const handleHpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDmgModeHp(checked);
    if (checked) {
        setDmgModeRaw(false);
    } else if (!dmgModeShield) {
        setDmgModeRaw(true);
    }
  };

  const handleShieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDmgModeShield(checked);
    if (checked) {
        setDmgModeRaw(false);
    } else if (!dmgModeHp) {
        setDmgModeRaw(true);
    }
  };


  return (
    <div className="h-screen flex flex-col font-sans selection:bg-accent-500/30 overflow-hidden">
      <header className="bg-gray-900 border-b border-gray-800 flex-shrink-0 h-16">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-accent-500 to-blue-600 p-2 rounded-lg">
              <Sword className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">P35 <span className="text-accent-400">战报分析器</span></h1>
          </div>
          <div className="text-sm text-gray-500 font-mono">v1.9.1 (作者: linhj)</div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4 overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-4 h-full">
          
          <div className="w-full lg:w-[320px] flex-shrink-0 flex flex-col gap-4 h-full min-h-0">
             
             <div className={`bg-gray-900 rounded-xl p-1 shadow-lg shadow-black/20 flex flex-col ${!data ? 'h-full' : 'flex-shrink-0'}`}>
                <div className={`bg-gray-800/50 rounded-lg p-4 border border-gray-700 flex flex-col overflow-y-auto custom-scrollbar ${!data ? 'h-full' : ''}`}>
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-accent-400" />
                      数据来源
                    </h2>
                    {data && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">生效中</span>}
                  </div>
                  
                  {!data ? (
                    <FileUpload onDataLoaded={handleDataLoaded} />
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3 bg-gray-900 rounded border border-gray-700 flex items-center gap-3">
                        <div className="bg-gray-800 p-2 rounded">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div className="overflow-hidden">
                          <div className="text-sm font-medium text-gray-200 truncate">{fileName}</div>
                          <div className="flex flex-col gap-1 mt-1">
                               <div className="text-xs text-gray-500 flex justify-between">
                                 <span>血量记录:</span> 
                                 <span className="text-gray-300">{data.entries.length.toLocaleString()}</span>
                               </div>
                               <div className="text-xs text-gray-500 flex justify-between">
                                 <span>技能记录:</span> 
                                 <span className="text-gray-300">{data.skillEntries.length.toLocaleString()}</span>
                               </div>
                               <div className="text-xs text-gray-500 flex justify-between">
                                 <span>效果记录:</span> 
                                 <span className="text-gray-300">{(data.effectDamageEntries.length + data.effectHealingEntries.length + data.effectShieldEntries.length).toLocaleString()}</span>
                               </div>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setData(null)} 
                        className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                      >
                        上传其他文件
                      </button>
                    </div>
                  )}
                </div>
             </div>

             {data && (
                <div className="bg-gray-900 rounded-xl p-1 shadow-lg shadow-black/20 flex-1 min-h-0 flex flex-col animate-fade-in-up">
                   <UnitSelector 
                    units={data.units} 
                    selectedUnits={selectedUnits} 
                    onChange={setSelectedUnits} 
                   />
                </div>
             )}
          </div>

          {data && (chartMode === 'skill' || chartMode === 'effect' || chartMode === 'healing' || chartMode === 'shield') && (
             <div className="w-full lg:w-[300px] flex-shrink-0 flex flex-col h-full min-h-0">
               <div className="bg-gray-900 rounded-xl p-1 shadow-lg shadow-black/20 h-full flex flex-col animate-fade-in-up">
                  {chartMode === 'skill' && (
                    <GenericSelector 
                      items={availableSkills}
                      selectedItems={selectedSkills}
                      onChange={setSelectedSkills}
                      title="技能筛选"
                      emptyMessage="未找到匹配技能"
                      icon={Filter}
                    />
                  )}
                  {chartMode === 'effect' && (
                    <GenericSelector 
                      items={availableEffects}
                      selectedItems={selectedEffects}
                      onChange={setSelectedEffects}
                      title="效果筛选"
                      emptyMessage="未找到匹配效果"
                      icon={Flame}
                    />
                  )}
                  {chartMode === 'healing' && (
                    <GenericSelector 
                      items={availableHealingEffects}
                      selectedItems={selectedHealingEffects}
                      onChange={setSelectedHealingEffects}
                      title="治疗筛选"
                      emptyMessage="未找到匹配治疗效果"
                      icon={Heart}
                    />
                  )}
                  {chartMode === 'shield' && (
                    <GenericSelector 
                      items={availableShieldEffects}
                      selectedItems={selectedShieldEffects}
                      onChange={setSelectedShieldEffects}
                      title="护盾筛选"
                      emptyMessage="未找到匹配护盾效果"
                      icon={Shield}
                    />
                  )}
               </div>
             </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col h-full min-h-0">
              <div className="bg-gray-900 rounded-xl p-1 shadow-lg shadow-black/20 h-full flex flex-col">
                <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-4 shrink-0">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        {getChartIcon(chartMode)}
                        {getChartTitle(chartMode)}
                      </h2>
                      {selectedUnits.length > 0 ? (
                        <p className="text-sm text-gray-400 mt-1">
                          已选择 <span className="text-white font-medium">{selectedUnits.length}</span> 个单位
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 mt-1">请选择单位开始分析</p>
                      )}
                      
                      {/* Damage Statistics Options */}
                      {chartMode === 'effect' && (
                         <div className="flex items-center gap-4 mt-3 bg-gray-900/50 p-2 rounded-lg border border-gray-700/50 text-sm animate-fade-in">
                           <span className="text-gray-400 font-medium text-xs uppercase tracking-wider">统计维度:</span>
                           <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                             <input 
                               type="checkbox" 
                               checked={dmgModeRaw} 
                               onChange={handleRawChange}
                               className="rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500 focus:ring-offset-gray-900" 
                             /> 
                             <span>原始伤害</span>
                           </label>
                           <div className="w-px h-4 bg-gray-700"></div>
                           <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                             <input 
                               type="checkbox" 
                               checked={dmgModeHp} 
                               onChange={handleHpChange}
                               className="rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500 focus:ring-offset-gray-900" 
                             /> 
                             <span>实际生命扣除</span>
                           </label>
                           <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                             <input 
                               type="checkbox" 
                               checked={dmgModeShield} 
                               onChange={handleShieldChange}
                               className="rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500 focus:ring-offset-gray-900" 
                             /> 
                             <span>护盾扣除</span>
                           </label>
                         </div>
                      )}
                    </div>

                    <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
                      <button
                        onClick={() => setChartMode('hp')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                          ${chartMode === 'hp' 
                            ? 'bg-gray-700 text-white shadow' 
                            : 'text-gray-400 hover:text-gray-200'}`}
                        title="血量曲线"
                      >
                        <Activity className="w-4 h-4" />
                        <span className="hidden xl:inline">血量</span>
                      </button>
                      <button
                        onClick={() => setChartMode('skill')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                          ${chartMode === 'skill' 
                            ? 'bg-gray-700 text-white shadow' 
                            : 'text-gray-400 hover:text-gray-200'}`}
                        title="技能统计"
                      >
                        <Zap className="w-4 h-4" />
                        <span className="hidden xl:inline">技能</span>
                      </button>
                       <button
                        onClick={() => setChartMode('effect')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                          ${chartMode === 'effect' 
                            ? 'bg-gray-700 text-white shadow' 
                            : 'text-gray-400 hover:text-gray-200'}`}
                        title="伤害统计"
                      >
                        <Flame className="w-4 h-4" />
                        <span className="hidden xl:inline">伤害</span>
                      </button>
                      <button
                        onClick={() => setChartMode('healing')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                          ${chartMode === 'healing' 
                            ? 'bg-gray-700 text-white shadow' 
                            : 'text-gray-400 hover:text-gray-200'}`}
                        title="治疗统计"
                      >
                        <Heart className="w-4 h-4" />
                        <span className="hidden xl:inline">治疗</span>
                      </button>
                      <button
                        onClick={() => setChartMode('shield')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                          ${chartMode === 'shield' 
                            ? 'bg-gray-700 text-white shadow' 
                            : 'text-gray-400 hover:text-gray-200'}`}
                        title="护盾施加统计"
                      >
                        <Shield className="w-4 h-4" />
                        <span className="hidden xl:inline">护盾</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-h-0 flex flex-col">
                    {data ? (
                      <>
                        {chartMode === 'hp' && <HpChart data={data.entries} selectedUnits={selectedUnits} />}
                        {chartMode === 'skill' && (
                          <SkillChart 
                            data={data.skillEntries} 
                            selectedUnits={selectedUnits}
                            selectedSkills={selectedSkills}
                          />
                        )}
                        {chartMode === 'effect' && (
                           <EffectDamageChart 
                             data={data.effectDamageEntries}
                             selectedUnits={selectedUnits}
                             selectedEffects={selectedEffects}
                             showRaw={dmgModeRaw}
                             showHp={dmgModeHp}
                             showShield={dmgModeShield}
                           />
                        )}
                        {chartMode === 'healing' && (
                           <EffectHealingChart 
                             data={data.effectHealingEntries}
                             selectedUnits={selectedUnits}
                             selectedEffects={selectedHealingEffects}
                           />
                        )}
                        {chartMode === 'shield' && (
                           <EffectShieldChart 
                             data={data.effectShieldEntries}
                             selectedUnits={selectedUnits}
                             selectedEffects={selectedShieldEffects}
                           />
                        )}
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                         <div className="bg-gray-800 p-6 rounded-full">
                           <TrendingUp className="w-16 h-16 text-gray-400" />
                         </div>
                         <div className="max-w-md">
                           <h3 className="text-xl font-semibold text-gray-200">等待战报数据</h3>
                           <p className="text-gray-400 mt-2">请在左侧上传战报文件 (CSV/Log)，或加载演示数据以预览功能。</p>
                         </div>
                      </div>
                    )}
                  </div>
                </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);