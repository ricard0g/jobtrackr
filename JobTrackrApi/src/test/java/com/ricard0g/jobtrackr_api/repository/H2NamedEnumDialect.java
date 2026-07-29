package com.ricard0g.jobtrackr_api.repository;

import org.hibernate.boot.model.TypeContributions;
import org.hibernate.dialect.H2Dialect;
import org.hibernate.service.ServiceRegistry;
import org.hibernate.type.SqlTypes;
import org.hibernate.type.descriptor.sql.internal.DdlTypeImpl;

public class H2NamedEnumDialect extends H2Dialect {

    @Override
    public void contributeTypes(
            final TypeContributions typeContributions, final ServiceRegistry serviceRegistry) {
        super.contributeTypes(typeContributions, serviceRegistry);
        typeContributions
                .getTypeConfiguration()
                .getDdlTypeRegistry()
                .addDescriptor(new DdlTypeImpl(SqlTypes.NAMED_ENUM, "varchar(255)", this));
    }
}
