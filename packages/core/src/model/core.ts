import EventEmitter from 'events'
import { ModeType, IListProps,
    IListState, IListFilterData, IListMultipleDataParams,
    IListSortConfig,
    IListMultipleData, IListMultiplePageSize, IListBaseResponse, IListKVMap,
    IListPageData,
    IListSelectionConfig
} from '../types'

const defaultSortConfig: IListSortConfig = {
    mode: 'single',
    sortLocal: undefined,
    sorter: {}
}

// 继承EventEmitter, 实例中包含 on, emit, removeListener等事件方法，用于和UI通信交互
export default class ListCore extends EventEmitter {
    // 优先级：本地dataSource > url > 自定义query
    private state: IListState
    filterInstance: any

    constructor(props: IListProps = {}) {        
        super()

        // 本地数据模式
        this.setMaxListeners(1000)
        let total = Number(props.total || 0)
        let totalPages = Number(props.totalPages || 0)        
        let currentPage = Number(props.currentPage || 1)
        let pageSize = Number(props.pageSize || 10)
        let paginationDataSource = props.dataSource || []
        let dataSource = props.dataSource || []
        let selectionConfig = props.selectionConfig || null
        let sortConfig = props.sortConfig || defaultSortConfig
        let mode = ModeType.URL // 默认模式是url模式
        if (props.dataSource) {
            mode = ModeType.DATASOURCE
            paginationDataSource = dataSource.slice((currentPage - 1) * pageSize, currentPage * pageSize)
            total = dataSource.length
            totalPages = Math.ceil(total / pageSize)
        }
        if (props.url) mode = ModeType.URL

        // 所有构建传入的实例参数都会在这里     
        this.state = {
            mode,
            autoLoad: props.autoLoad || true,// 初始直接发起请求
            dataSource,// 列表数据
            paginationDataSource, // 本地分页列表数据
            pageSize,// 分页数据
            currentPage,// 当前页数
            total, // 总数据条目数
            totalPages, // 总页面数
            loading: false,// 当前加载数据状态: true | false
            defaultFilterValues: props.defaultFilterValues || {},
            validateConfig: props.validateConfig || {},
            filterValues: props.defaultFilterValues || {},     
            tableProps: {},       
            multipleData: {},
            multiplePageSize: {},
            sortConfig,
            selectionConfig, // 当前勾选的项
        }

        // // 在这里处理初始化表单实例
        // this.filterInstance = createForm({
        //     initialValues: this.state.defaultFilterValues,
        //     values: this.state.filterValues,
        //     lifecycles: [
        //         new FormLifeCycle(LifeCycleTypes.ON_FIELD_CHANGE, (field) => {
        //             this.emit(FilterType.ITEM_CHANGE, field.getState())
        //         })
        //     ]
        // })
    }

    setSortConfig = (sortConfig?: IListSortConfig) => {
        if ('mode' in sortConfig) {
            this.state.sortConfig.mode = sortConfig.mode
        }

        if ('sortLocal' in sortConfig) {
            this.state.sortConfig.sortLocal = sortConfig.sortLocal
        }

        const { sorter } = sortConfig
        const { mode } = this.state.sortConfig
        let mergedSorter = {}
        if (mode === 'multiple') {
            mergedSorter = { ...this.state.sortConfig.sorter }
        }

        this.state.sortConfig.sorter = {
            ...mergedSorter,
            ...(sorter || {})
        }

        Object.keys(sorter || {}).forEach(k => {
            if (!sorter[k]) {
                delete this.state.sortConfig.sorter[k]
            }
        })
    }

    getSortConfig = () => {
        return this.state.sortConfig
    }

    // 设置勾选项配置
    setSelectionConfig = (selectionConfig?: IListSelectionConfig) => {
        if (selectionConfig === null) {
            this.state.selectionConfig = null
        } else {
            const clearDataProps: { ids?: string[], records?: any[] } = {}
            const { mode } = this.state.selectionConfig || {}
            if (!!mode && !!selectionConfig?.mode && (mode !== selectionConfig?.mode)) {
                clearDataProps.ids = []
                clearDataProps.records = []
            }

            const defaultSelectionConfig: IListSelectionConfig = {
                getProps: () => ({}),
                mode: 'multiple',
                primaryKey: 'id',
                ids: [],
                records: [],
            }

            this.state.selectionConfig = {
                ...(this.state.selectionConfig || defaultSelectionConfig),
                ...(selectionConfig || {}),
                ...clearDataProps
            }

            if (!selectionConfig?.records) {
                const { primaryKey } = this.state.selectionConfig
                this.state.selectionConfig.records = this.getPaginationDataSource().filter(item => {
                    return this.state.selectionConfig.ids.indexOf(item[primaryKey]) !== -1
                })
            }
        }
    }

    getSelectionConfig = () => {
        return this.state.selectionConfig
    }

    getSelections = () => {
        const { ids = [], records = [] } = this.state.selectionConfig || {}
        return { ids, records }
    }

    getTableProps = () => {
        const { tableProps } = this.state
        return tableProps
    }

    setTableProps = (targetTableProps) => {
        const { tableProps } = this.state
        this.state.tableProps = {
            ...(tableProps || {}),
            ...(targetTableProps || {}),
        }
    }

    getFilterProps = () => {
        const { defaultFilterValues, filterValues } = this.state
        return {
            initialValues: defaultFilterValues,
            values: filterValues,            
        }
    }

    getFilterInstance = (): any => {
        return this.filterInstance
    }

    setFilterInstance = (filterInstance: any) => {
        this.filterInstance = filterInstance
    }

    setValidateConfig = (validateConfig?: IListKVMap<any>) => {
        this.state.validateConfig = validateConfig || {}
    }

    getValidateConfig = () => this.state.validateConfig

    getMode = () => this.state.mode

    setPaginationDataSource = (paginationDataSource?: any[]) => {
        this.state.paginationDataSource = paginationDataSource || []        
    }

    getPaginationDataSource = () => this.state.paginationDataSource

    // 设置dataSource
    setDataSource = (dataSource?: any[]) => {
        this.state.dataSource = dataSource || []        
    }

    getDataSource = () => this.state.dataSource

    setPageSize = (pageSize: number) => {
        if (!isNaN(pageSize)) {
            this.state.pageSize = Number(pageSize)
            this.resetPage()
        }
    }

    // 设置分页数据
    setPageData = (pageData: IListPageData) => {
        const { pageSize, total, currentPage, totalPages } = pageData
        if ('pageSize' in pageData && !isNaN(pageSize)) this.state.pageSize = Number(pageSize)
        if ('total' in pageData && !isNaN(total)) this.state.total = Number(total)
        if ('currentPage' in pageData && !isNaN(currentPage)) this.state.currentPage = currentPage < 1 ? 1 : Number(currentPage)
        if ('totalPages' in pageData && !isNaN(totalPages)) this.state.totalPages = Number(totalPages)
    }

    // 获取分页数据
    getPageData = () => {
        const { pageSize, total, currentPage, totalPages } = this.state
        return {
            pageSize,
            total,
            totalPages,
            currentPage,
        }
    }

    // 重置分页数据到第一页
    resetPage = () => {
        this.setCurrentPage(1)
    }
    
    // 设置当前页面
    setCurrentPage = (currentPage: number) => {
        const { mode, dataSource, pageSize } = this.state
        if (mode === ModeType.DATASOURCE) {
            const paginationDataSource = dataSource.slice((currentPage - 1) * pageSize, currentPage * pageSize)
            this.setPaginationDataSource(paginationDataSource)
        }
        this.state.currentPage = currentPage
    }

    // 设置loading状态
    setLoading = (loading: boolean) => this.state.loading = loading
    getLoading = () => this.state.loading

    // 设置多实例列表分页数据
    setMultiplePageSize = (multiplePageSize: IListMultiplePageSize) => {
        Object.keys(multiplePageSize).forEach(key => {
            if (!isNaN(multiplePageSize[key])) {
                this.state.multiplePageSize[key] = Number(multiplePageSize[key])
            }
        })
    }

    // 设置多实例列表数据
    setMultipleData = (multipleData: IListMultipleDataParams) => {
        const multipleKeys = Object.keys(multipleData)
        const formatMultipleData: IListMultipleData = { ...this.state.multipleData }
        multipleKeys.forEach(key => {
            const pageSize = this.state.multiplePageSize[key] || 10
            if (Array.isArray(multipleData[key])) {
                formatMultipleData[key] = {
                    currentPage: 1,
                    pageSize,
                    dataList: multipleData[key] as any[],
                    paginationDataList: (multipleData[key] as any[]).slice(0, pageSize),
                    total: (multipleData[key] as any[]).length,
                    totalPages: Math.ceil((multipleData[key] as any[]).length / pageSize),
                }
            } else if (multipleData[key] !== undefined) {
                const currentMultipleData = multipleData[key] as IListBaseResponse
                if ('pageSize' in currentMultipleData && !isNaN(currentMultipleData.pageSize)) {
                    this.setMultiplePageSize({ [key]: currentMultipleData.pageSize })
                }

                const { currentPage: settingCurrentPage = 1, pageSize: settingPageSize = pageSize } = currentMultipleData
                const currentPage = Number(settingCurrentPage)
                const prevMultipleData = this.state.multipleData[key] || {}
                const dataList = currentMultipleData.dataList || prevMultipleData.dataList || []
                const paginationDataList = dataList.slice((currentPage - 1) * pageSize, (currentPage) * pageSize)                
                formatMultipleData[key] = {
                    ...prevMultipleData,
                    currentPage,
                    pageSize: Number(settingPageSize),
                    dataList,
                    paginationDataList,
                    total: dataList.length,
                    totalPages: Math.ceil(dataList.length / Number(settingPageSize))
                }
            }
        })

        this.state.multipleData = formatMultipleData
    }
    getMultipleData = (): IListMultipleData => this.state.multipleData

    // 清空搜索数据
    clearFilterData = () => {
        this.filterInstance && this.filterInstance.reset({ forceClear: true })
    }

    // 重置搜索数据
    resetFilterData = () => {
        this.filterInstance && this.filterInstance.reset({ forceClear: false })
    }

    // 设置搜索数据
    setFilterData = (filterData: IListFilterData, slient?: boolean) => {
        if (this.filterInstance) {
            this.filterInstance.setFormState(state => {
                state.values = {
                    ...state.values,
                    ...filterData,
                }
            }, slient)
        }        
    }

    // 透传
    setFormState = (...args) => (this.filterInstance && this.filterInstance.setFormState(...args))
    getFormState = (...args) => (this.filterInstance && this.filterInstance.getFormState(...args))
    setFieldState = (...args) => (this.filterInstance && this.filterInstance.setFieldState(...args))
    getFieldState = (...args) => (this.filterInstance && this.filterInstance.getFieldState(...args))

    // 获取搜索数据
    getFilterData = (enableInvalid?: boolean) => {
        const result = {}
        if (this.filterInstance) {
            const filterData = this.filterInstance.getFormState(state => state.values)
            Object.keys(filterData).forEach((key) => {
                if (enableInvalid === true ||
                    [null, undefined].indexOf(filterData[key]) === -1) {
                    result[key] = filterData[key]
                }
            })
        }

        return result
    }

    // 根据路径获取指定的数据
    getState = (key?: string) => {
        return key ? this.state[key] : this.state
    }
}

